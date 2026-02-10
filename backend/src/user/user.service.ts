import { Injectable } from '@nestjs/common';
import { AuthUser } from 'src/interfaces/AuthUser.interface';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(currentUserId: string, query?: string): Promise<AuthUser[]> {
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
      take: 20,
    });
    return users;
  }
}
