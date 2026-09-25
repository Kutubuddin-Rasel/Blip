import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import { RateLimit, RateLimitGuard } from 'src/rate-limit/rate-limit.guard';
import { RelationshipService } from 'src/relationship/relationship.service';

@Controller('users')
export class BlockController {
  constructor(private readonly relationships: RelationshipService) {}

  @Post(':userId/block')
  @RateLimit('block')
  @UseGuards(AccessTokenGuard, RateLimitGuard)
  block(
    @Req() req: Request,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) peerId: string,
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Session unavailable');
    return this.relationships.block(req.user.id, peerId);
  }

  @Delete(':userId/block')
  @RateLimit('block')
  @UseGuards(AccessTokenGuard, RateLimitGuard)
  unblock(
    @Req() req: Request,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) peerId: string,
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Session unavailable');
    return this.relationships.unblock(req.user.id, peerId);
  }
}
