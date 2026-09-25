import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RelationshipService } from './relationship.service';

@Module({
  providers: [RelationshipService, PrismaService],
  exports: [RelationshipService],
})
export class RelationshipModule {}
