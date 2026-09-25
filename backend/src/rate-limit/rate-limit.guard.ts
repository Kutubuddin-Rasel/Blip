import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { PrismaService } from 'src/prisma.service';

export const RATE_POLICIES = {
  discovery: { limit: 10, windowMs: 60_000 },
  start: { limit: 20, windowMs: 60_000 },
  message: { limit: 60, windowMs: 60_000 },
  auth: { limit: 20, windowMs: 60_000 },
} as const;
export type RatePolicy = keyof typeof RATE_POLICIES;
const POLICY_KEY = 'blipRatePolicy';
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RateLimit = (policy: RatePolicy) =>
  SetMetadata(POLICY_KEY, policy);

@Injectable()
export class RateLimitService {
  // ponytail: process-local windows fit one Nest instance; use shared storage if deployment becomes multi-instance.
  private readonly buckets = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  consume(policy: RatePolicy, identity: string, now = Date.now()): number {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
    const key = `${policy}:${identity}`;
    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, {
        count: 1,
        expiresAt: now + RATE_POLICIES[policy].windowMs,
      });
      return 0;
    }
    if (bucket.count >= RATE_POLICIES[policy].limit)
      return Math.ceil((bucket.expiresAt - now) / 1000);
    bucket.count++;
    return 0;
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<RatePolicy>(
      POLICY_KEY,
      context.getHandler(),
    );
    if (!policy) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const userId = req.user?.id;
    if (policy !== 'auth' && !userId)
      throw new UnauthorizedException('Session unavailable');
    // Proxy headers are deliberately ignored until a trusted proxy is configured.
    const identity =
      policy === 'auth' ? (req.socket.remoteAddress ?? 'unknown') : userId!;
    const retryAfter = this.limits.consume(policy, identity);
    if (!retryAfter) return true;
    if (
      userId &&
      (await this.isCommittedReplay(policy, userId, req.body as unknown))
    )
      return true;
    res.setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async isCommittedReplay(
    policy: RatePolicy,
    userId: string,
    body: unknown,
  ): Promise<boolean> {
    if (
      (policy !== 'message' && policy !== 'start') ||
      !body ||
      typeof body !== 'object'
    )
      return false;
    const request = body as Record<string, unknown>;
    if (
      typeof request.clientMessageId !== 'string' ||
      !uuidV4.test(request.clientMessageId)
    )
      return false;
    const existing = await this.prisma.message.findUnique({
      where: {
        userId_clientMessageId: {
          userId,
          clientMessageId: request.clientMessageId,
        },
      },
      select: {
        content: true,
        conversationId: true,
        conversation: { select: { directKey: true } },
      },
    });
    if (!existing) return false;
    if (policy === 'message')
      return (
        existing.content === request.content &&
        existing.conversationId === request.conversationId
      );
    return (
      typeof request.recipientId === 'string' &&
      existing.content === request.initialMessage &&
      existing.conversation.directKey ===
        [userId, request.recipientId].sort().join(':')
    );
  }
}
