import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class RelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  async state(
    userId: string,
    peerId: string,
  ): Promise<{
    canMessage: boolean;
    blockedByMe: boolean;
  }> {
    const [peer, blocks] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: peerId },
        select: { deletedAt: true },
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: userId, blockedId: peerId },
            { blockerId: peerId, blockedId: userId },
          ],
        },
        select: { blockerId: true },
      }),
    ]);
    return {
      canMessage: !!peer && !peer.deletedAt && blocks.length === 0,
      blockedByMe: blocks.some((block) => block.blockerId === userId),
    };
  }

  async isBlocked(userId: string, peerId: string): Promise<boolean> {
    return !!(await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: peerId },
          { blockerId: peerId, blockedId: userId },
        ],
      },
      select: { id: true },
    }));
  }

  // Pair locks serialize a new send/start with block changes and account deletion.
  async assertCanCommunicate(
    tx: Prisma.TransactionClient,
    userId: string,
    peerId: string,
  ): Promise<void> {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User"
      WHERE (id = ${userId}::uuid OR id = ${peerId}::uuid)
        AND "deletedAt" IS NULL
      ORDER BY id FOR UPDATE
    `;
    if (users.length !== 2)
      throw new NotFoundException('Recipient unavailable');
    const block = await tx.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: peerId },
          { blockerId: peerId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) throw new NotFoundException('Recipient unavailable');
  }

  async block(userId: string, peerId: string): Promise<{ blocked: true }> {
    if (userId === peerId)
      throw new BadRequestException('Cannot block yourself');
    await this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "User"
        WHERE (id = ${userId}::uuid OR id = ${peerId}::uuid)
          AND "deletedAt" IS NULL
        ORDER BY id FOR UPDATE
      `;
      if (users.length !== 2) throw new NotFoundException('User unavailable');
      await tx.block.upsert({
        where: {
          blockerId_blockedId: { blockerId: userId, blockedId: peerId },
        },
        create: { blockerId: userId, blockedId: peerId },
        update: {},
      });
    });
    return { blocked: true };
  }

  async unblock(userId: string, peerId: string): Promise<{ blocked: false }> {
    if (userId === peerId)
      throw new BadRequestException('Cannot unblock yourself');
    await this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "User"
        WHERE (id = ${userId}::uuid OR id = ${peerId}::uuid)
          AND "deletedAt" IS NULL
        ORDER BY id FOR UPDATE
      `;
      if (users.length !== 2) throw new NotFoundException('User unavailable');
      await tx.block.deleteMany({
        where: { blockerId: userId, blockedId: peerId },
      });
    });
    return { blocked: false };
  }
}
