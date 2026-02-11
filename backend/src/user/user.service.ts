import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(currentUserId: string, query?: string, cursor?: string) {
    const limit = 20;
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        ...(query && {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phoneNumber: { contains: query } },
          ],
        }),
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        phoneNumber: true,
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { name: 'asc' },
    });

    let nextCursor: null | string = null;
    if (users.length > limit) {
      const nextItem = users.pop();
      if (nextItem) {
        nextCursor = nextItem.id;
      }
    }
    return {
      items: users,
      nextCursor,
    };
  }
}
