import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { PrismaService } from 'src/prisma.service';
import {
  Conversations,
  CreatedConversation,
} from 'src/interfaces/Conversation.interface';
import { Conversation } from 'generated/prisma/client';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createConversationDto: CreateConversationDto,
    currentuserId: string,
  ): Promise<CreatedConversation> {
    const { userIds, name, initialMessage } = createConversationDto;

    const existingCounts = await this.prisma.user.count({
      where: { id: { in: userIds } },
    });
    if (existingCounts != userIds.length) {
      throw new BadRequestException('One or more user IDs are invalid');
    }

    if (userIds.length === 1 && !initialMessage) {
      throw new BadRequestException(
        'Direct message required an initial message',
      );
    }

    const participantsId = [...new Set([...userIds, currentuserId])];

    const conversation = await this.prisma.conversation.create({
      data: {
        users: {
          connect: participantsId.map((id) => ({ id })),
        },
        name,
        messages: initialMessage
          ? {
              create: {
                content: initialMessage,
                userId: currentuserId,
              },
            }
          : undefined,
      },
    });
    return conversation;
  }

  async getConversations(userId: string): Promise<Array<Conversations>> {
    const conversations = await this.prisma.conversation.findMany({
      where: { users: { some: { id: userId } } },
      include: {
        users: {
          where: { id: { not: userId } },
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return conversations;
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: {
          some: { id: userId },
        },
      },
      include: {
        messages: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('No conversation with that user');
    }
    return conversation;
  }
}
