import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import type { Request } from 'express';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationService: ConversationsService) {}

  @UseGuards(AccessTokenGuard)
  @Post('create')
  async create(
    @Req() req: Request,
    @Body() createConversationDto: CreateConversationDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exist');
    }
    const result = await this.conversationService.create(
      createConversationDto,
      userId,
    );
    return result;
  }

  @UseGuards(AccessTokenGuard)
  @Get()
  async getConversations(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exist');
    }
    const result = await this.conversationService.getConversations(userId);
    return result;
  }

  @UseGuards(AccessTokenGuard)
  @Get(':id')
  async getConversation(@Req() req: Request, @Param('id') id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exist');
    }
    const result = await this.conversationService.getConversation(id, userId);
    return result;
  }
}
