import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma.service';

@Module({
  imports: [JwtModule],
  providers: [EventsGateway, PrismaService],
  exports: [EventsGateway],
})
export class EventsModule {}
