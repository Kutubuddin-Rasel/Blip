import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma.service';
import { DiscoveryRateLimitGuard } from './discovery-rate-limit.guard';

@Module({
  controllers: [UserController],
  providers: [UserService, PrismaService, DiscoveryRateLimitGuard],
})
export class UserModule {}
