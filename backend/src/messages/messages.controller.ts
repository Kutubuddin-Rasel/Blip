import {
  Body,
  Controller,
  Get,
  Param,
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

@Controller('messages')
export class MessagesController {
  constructor(private readonly messageService: MessagesService) {}

  @UseGuards(AccessTokenGuard)
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
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 50,
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
