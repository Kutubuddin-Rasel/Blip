import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { CreateMessageDto } from './dto/create-message.dto';
import { PrismaService } from 'src/prisma.service';
import { EventsGateway } from 'src/events/events.gateway';
import type { Message, Page } from 'src/interfaces/Message.interface';
import { isCanonicalDirect } from 'src/conversations/direct-key';

const messageSelect = {
  id: true,
  clientMessageId: true,
  conversationId: true,
  userId: true,
  content: true,
  createdAt: true,
} as const;
type MessageRow = {
  id: string;
  clientMessageId: string;
  conversationId: string;
  userId: string;
  content: string;
  createdAt: Date;
};
type Cursor = { v: 1; c: string; t: string; id: string };
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    clientMessageId: row.clientMessageId,
    conversationId: row.conversationId,
    senderId: row.userId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function isClientMessageUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  )
    return false;
  const meta = error.meta as
    | {
        target?: string[];
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      }
    | undefined;
  const fields =
    meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  return (
    Array.isArray(fields) &&
    fields.length === 2 &&
    ['userId', 'clientMessageId'].every((field) =>
      fields.some((candidate) => candidate.replaceAll('"', '') === field),
    )
  );
}

function encodeCursor(conversationId: string, row: MessageRow): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      c: conversationId,
      t: row.createdAt.toISOString(),
      id: row.id,
    } satisfies Cursor),
  ).toString('base64url');
}

function decodeCursor(
  value: string,
  conversationId: string,
): { createdAt: Date; id: string } {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value))
    throw new BadRequestException('Invalid history cursor');
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value)
      throw new Error('Noncanonical cursor');
    const payload: unknown = JSON.parse(decoded.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error('Invalid cursor');
    const cursor = payload as Partial<Cursor>;
    if (
      Object.keys(cursor).sort().join(',') !== 'c,id,t,v' ||
      cursor.v !== 1 ||
      cursor.c !== conversationId ||
      typeof cursor.id !== 'string' ||
      !uuidV4.test(cursor.id) ||
      typeof cursor.t !== 'string'
    )
      throw new Error('Invalid cursor');
    const createdAt = new Date(cursor.t);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== cursor.t
    )
      throw new Error('Invalid timestamp');
    return { createdAt, id: cursor.id };
  } catch {
    throw new BadRequestException('Invalid history cursor');
  }
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async validateUserConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { directKey: true, users: { select: { id: true } } },
    });
    if (
      !conversation ||
      !isCanonicalDirect(conversation.directKey, conversation.users, userId)
    )
      throw new NotFoundException('Conversation not found');
  }

  async create(dto: CreateMessageDto, userId: string): Promise<Message> {
    const { conversationId, clientMessageId, content } = dto;
    let row: MessageRow;
    let inserted = false;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.findUnique({
          where: { id: conversationId },
          select: { directKey: true, users: { select: { id: true } } },
        });
        if (
          !conversation ||
          !isCanonicalDirect(conversation.directKey, conversation.users, userId)
        )
          throw new NotFoundException('Conversation not found');
        const message = await tx.message.create({
          data: { conversationId, userId, clientMessageId, content },
          select: messageSelect,
        });
        await tx.conversation.updateMany({
          where: {
            id: conversationId,
            OR: [
              { lastMessageAt: null },
              { lastMessageAt: { lt: message.createdAt } },
            ],
          },
          data: { lastMessageAt: message.createdAt },
        });
        return message;
      });
      inserted = true;
    } catch (error) {
      if (!isClientMessageUniqueConflict(error)) throw error;
      const existing = await this.prisma.message.findUnique({
        where: { userId_clientMessageId: { userId, clientMessageId } },
        select: messageSelect,
      });
      if (!existing) throw error;
      if (
        existing.conversationId !== conversationId ||
        existing.content !== content
      ) {
        throw new ConflictException('Client message ID already used');
      }
      await this.validateUserConversation(conversationId, userId);
      row = existing;
    }
    const message = toMessage(row);
    if (inserted) {
      try {
        await this.eventsGateway.publishMessageCreated(
          conversationId,
          message.id,
        );
      } catch {
        this.logger.warn(
          `Message ${message.id} committed but socket publish failed`,
        );
      }
    }
    return message;
  }

  async findByConversation(
    conversationId: string,
    userId: string,
    limit?: string,
    cursor?: string,
  ): Promise<Page<Message>> {
    await this.validateUserConversation(conversationId, userId);
    if (limit !== undefined && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) {
      throw new BadRequestException('History limit must be between 1 and 50');
    }
    const pageSize = limit === undefined ? 20 : Number(limit);
    const after =
      cursor === undefined ? null : decodeCursor(cursor, conversationId);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: messageSelect,
    });
    const items = rows.slice(0, pageSize);
    return {
      items: items.map(toMessage),
      nextCursor:
        rows.length > pageSize
          ? encodeCursor(conversationId, items[items.length - 1])
          : null,
    };
  }
}
