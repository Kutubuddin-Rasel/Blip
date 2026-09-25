import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// Controlled single-instance release: 10 authenticated attempts per user per 60 seconds.
export const DISCOVERY_LIMIT = 10;
export const DISCOVERY_WINDOW_MS = 60_000;

@Injectable()
export class DiscoveryRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    const userId = context.switchToHttp().getRequest<Request>().user?.id;
    if (!userId) return false;

    const now = Date.now();
    for (const [id, entry] of this.attempts) {
      if (entry.expiresAt <= now) this.attempts.delete(id);
    }
    const entry = this.attempts.get(userId);
    if (!entry) {
      this.attempts.set(userId, {
        count: 1,
        expiresAt: now + DISCOVERY_WINDOW_MS,
      });
      return true;
    }
    if (entry.count >= DISCOVERY_LIMIT) {
      throw new HttpException(
        'Discovery rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count++;
    return true;
  }
}
