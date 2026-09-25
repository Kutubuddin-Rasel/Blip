import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { PrismaService } from 'src/prisma.service';
import { EventsModule } from 'src/events/events.module';
import { RelationshipModule } from 'src/relationship/relationship.module';

@Module({
  imports: [EventsModule, RelationshipModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, PrismaService],
})
export class ConversationsModule {}
