import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma.service';
import { BlockController } from './block.controller';
import { RelationshipModule } from 'src/relationship/relationship.module';

@Module({
  imports: [RelationshipModule],
  controllers: [UserController, BlockController],
  providers: [UserService, PrismaService],
})
export class UserModule {}
