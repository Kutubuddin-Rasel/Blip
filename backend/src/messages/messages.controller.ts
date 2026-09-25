import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import type { Request } from 'express';
import { CreateMessageDto } from './dto/create-message.dto';
import { RateLimit, RateLimitGuard } from 'src/rate-limit/rate-limit.guard';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messageService: MessagesService) {}

  @RateLimit('message')
  @UseGuards(AccessTokenGuard, RateLimitGuard)
  @Post()
  async create(
    @Req() req: Request,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exists');
    }
    const result = await this.messageService.create(createMessageDto, userId);
    return result;
  }

  @UseGuards(AccessTokenGuard)
  @Get(':conversationId')
  async findByConversation(
    @Req() req: Request,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exists');
    }
    const result = await this.messageService.findByConversation(
      conversationId,
      userId,
      limit,
      cursor,
    );
    return result;
  }
}
