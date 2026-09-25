import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { PrismaService } from 'src/prisma.service';
import { EventsModule } from 'src/events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, PrismaService],
})
export class ConversationsModule {}
