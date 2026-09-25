import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma.service';
import { EventsModule } from 'src/events/events.module';
import { RelationshipModule } from 'src/relationship/relationship.module';

@Module({
  imports: [EventsModule, RelationshipModule],
  controllers: [MessagesController],
  providers: [MessagesService, PrismaService],
})
export class MessagesModule {}
