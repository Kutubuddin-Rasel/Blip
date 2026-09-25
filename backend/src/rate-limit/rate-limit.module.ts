import { Global, Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RateLimitGuard, RateLimitService } from './rate-limit.guard';

@Global()
@Module({
  providers: [RateLimitService, RateLimitGuard, PrismaService],
  exports: [RateLimitGuard, RateLimitService],
})
export class RateLimitModule {}
