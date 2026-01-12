import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async validateUserConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: { some: { id: userId } },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation does not existed');
    }
  }

  async create(createMessageDto: CreateMessageDto, userId: string) {
    const { conversationId, content } = createMessageDto;
    await this.validateUserConversation(conversationId, userId);
    const message = await this.prisma.message.create({
      data: {
        content,
        conversation: {
          connect: { id: conversationId },
        },
        user: {
          connect: { id: userId },
        },
      },
    });

    return message;
  }

  async findByConversation(
    conversationId: string,
    userId: string,
    limit: number,
    cursor?: string,
  ) {
    await this.validateUserConversation(conversationId, userId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return messages;
  }
}
