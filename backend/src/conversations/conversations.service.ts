import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { PrismaService } from 'src/prisma.service';
import {
  ConversationDetail,
  ConversationPeer,
  ConversationSummary,
  StartDirectResult,
} from 'src/interfaces/Conversation.interface';
import type { Message } from 'src/interfaces/Message.interface';
import { directKey, isCanonicalDirect } from './direct-key';
import { EventsGateway } from 'src/events/events.gateway';
import { RelationshipService } from 'src/relationship/relationship.service';

const latestMessageOrder: [{ createdAt: 'desc' }, { id: 'desc' }] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

const conversationSelect = {
  id: true,
  directKey: true,
  users: { select: { id: true, name: true, avatar: true, deletedAt: true } },
  messages: {
    take: 1,
    orderBy: latestMessageOrder,
    select: { id: true, content: true, createdAt: true },
  },
} as const;

type SafeConversationRow = {
  id: string;
  directKey: string | null;
  users: (Omit<ConversationPeer, 'isDeleted'> & { deletedAt: Date | null })[];
  messages: { id: string; content: string; createdAt: Date }[];
};

const startMessageSelect = {
  id: true,
  clientMessageId: true,
  content: true,
  createdAt: true,
  userId: true,
  conversationId: true,
} as const;

type StartMessageRow = {
  id: string;
  clientMessageId: string;
  content: string;
  createdAt: Date;
  userId: string;
  conversationId: string;
};

function toStartedMessage(message: StartMessageRow): Message {
  return {
    id: message.id,
    clientMessageId: message.clientMessageId,
    conversationId: message.conversationId,
    senderId: message.userId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function isUniqueOn(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | {
        target?: string[];
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      }
    | undefined;
  const fields =
    meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  return fields?.some((name) => name.replaceAll('"', '') === field) ?? false;
}

function directPeer(
  users: SafeConversationRow['users'],
  currentUserId: string,
  key: string | null,
): ConversationPeer | null {
  if (!isCanonicalDirect(key, users, currentUserId)) return null;
  const user = users.find((participant) => participant.id !== currentUserId);
  return user
    ? {
        id: user.id,
        name: user.deletedAt ? 'Deleted user' : user.name,
        avatar: user.deletedAt ? null : user.avatar,
        isDeleted: !!user.deletedAt,
      }
    : null;
}

function toSummary(
  row: SafeConversationRow,
  peer: ConversationPeer,
): ConversationSummary {
  const message = row.messages[0];
  const latestMessage = message
    ? {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      }
    : null;
  return {
    id: row.id,
    kind: 'direct',
    peer,
    latestMessage,
    lastMessageAt: latestMessage?.createdAt ?? null,
  };
}

function toDetail(
  row: SafeConversationRow,
  peer: ConversationPeer,
  relationship: { canMessage: boolean; blockedByMe: boolean },
): ConversationDetail {
  return {
    id: row.id,
    kind: 'direct',
    peer,
    lastMessageAt: row.messages[0]?.createdAt.toISOString() ?? null,
    ...relationship,
  };
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly relationships: RelationshipService,
  ) {}

  async create(
    createConversationDto: CreateConversationDto,
    currentUserId: string,
  ): Promise<StartDirectResult> {
    const { recipientId, initialMessage, clientMessageId } =
      createConversationDto;
    const key = directKey(currentUserId, recipientId);
    if (Boolean(initialMessage) !== Boolean(clientMessageId)) {
      throw new BadRequestException(
        'Initial message and client message ID must be supplied together',
      );
    }
    if (
      !(await this.relationships.state(currentUserId, recipientId)).canMessage
    )
      throw new NotFoundException('Recipient unavailable');

    let conversationId: string;
    let message: StartMessageRow | null = null;
    let createdNew = false;
    let insertedMessage = false;
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey: key },
      select: { id: true },
    });
    if (existing) {
      conversationId = existing.id;
      await this.prisma.$transaction((tx) =>
        this.relationships.assertCanCommunicate(tx, currentUserId, recipientId),
      );
      if (initialMessage && clientMessageId) {
        const first = await this.addFirstMessage(
          conversationId,
          currentUserId,
          recipientId,
          initialMessage,
          clientMessageId,
        );
        message = first.message;
        insertedMessage = first.inserted;
      }
    } else {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          await this.relationships.assertCanCommunicate(
            tx,
            currentUserId,
            recipientId,
          );
          const now = initialMessage ? new Date() : null;
          const conversation = await tx.conversation.create({
            data: {
              directKey: key,
              lastMessageAt: now,
              users: {
                connect: [{ id: currentUserId }, { id: recipientId }],
              },
            },
            select: { id: true },
          });
          const firstMessage =
            initialMessage && clientMessageId && now
              ? await tx.message.create({
                  data: {
                    conversationId: conversation.id,
                    userId: currentUserId,
                    content: initialMessage,
                    clientMessageId,
                    createdAt: now,
                  },
                  select: startMessageSelect,
                })
              : null;
          return { conversationId: conversation.id, message: firstMessage };
        });
        conversationId = created.conversationId;
        message = created.message;
        createdNew = true;
        insertedMessage = Boolean(message);
      } catch (error) {
        if (isUniqueOn(error, 'directKey')) {
          const winner = await this.prisma.conversation.findUniqueOrThrow({
            where: { directKey: key },
            select: { id: true },
          });
          conversationId = winner.id;
          if (initialMessage && clientMessageId) {
            const first = await this.addFirstMessage(
              conversationId,
              currentUserId,
              recipientId,
              initialMessage,
              clientMessageId,
            );
            message = first.message;
            insertedMessage = first.inserted;
          }
        } else if (isUniqueOn(error, 'clientMessageId')) {
          throw new ConflictException('Client message ID already used');
        } else {
          throw error;
        }
      }
    }
    const result = {
      conversation: await this.getConversation(conversationId, currentUserId),
      message: message ? toStartedMessage(message) : null,
    };
    if (createdNew) {
      try {
        this.eventsGateway.publishConversationCreated(conversationId, [
          currentUserId,
          recipientId,
        ]);
      } catch {
        this.logger.warn(
          `Conversation ${conversationId} committed but socket publish failed`,
        );
      }
    }
    if (insertedMessage && message) {
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
    return result;
  }

  private async addFirstMessage(
    conversationId: string,
    userId: string,
    recipientId: string,
    content: string,
    clientMessageId: string,
  ): Promise<{ message: StartMessageRow; inserted: boolean }> {
    const where = { userId_clientMessageId: { userId, clientMessageId } };
    const replay = (message: StartMessageRow) => {
      if (
        message.conversationId !== conversationId ||
        message.content !== content
      ) {
        throw new ConflictException('Client message ID already used');
      }
      return message;
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previous = await tx.message.findUnique({
          where,
          select: startMessageSelect,
        });
        if (previous) return { message: replay(previous), inserted: false };
        await this.relationships.assertCanCommunicate(tx, userId, recipientId);
        const now = new Date();
        const message = await tx.message.create({
          data: {
            conversationId,
            userId,
            content,
            clientMessageId,
            createdAt: now,
          },
          select: startMessageSelect,
        });
        await tx.conversation.updateMany({
          where: {
            id: conversationId,
            OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: now } }],
          },
          data: { lastMessageAt: now },
        });
        return { message, inserted: true };
      });
    } catch (error) {
      if (!isUniqueOn(error, 'clientMessageId')) throw error;
      const winner = await this.prisma.message.findUniqueOrThrow({
        where,
        select: startMessageSelect,
      });
      return { message: replay(winner), inserted: false };
    }
  }

  async getConversations(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { directKey: { not: null }, users: { some: { id: userId } } },
      select: conversationSelect,
    });
    return conversations
      .flatMap((conversation) => {
        const peer = directPeer(
          conversation.users,
          userId,
          conversation.directKey,
        );
        return peer ? [toSummary(conversation, peer)] : [];
      })
      .sort((a, b) =>
        a.lastMessageAt === b.lastMessageAt
          ? b.id.localeCompare(a.id)
          : (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
      );
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationDetail> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        directKey: { not: null },
        users: {
          some: { id: userId },
        },
      },
      select: conversationSelect,
    });

    const peer =
      conversation &&
      directPeer(conversation.users, userId, conversation.directKey);
    if (!conversation || !peer) {
      throw new NotFoundException('Conversation not found');
    }
    return toDetail(
      conversation,
      peer,
      await this.relationships.state(userId, peer.id),
    );
  }
}
