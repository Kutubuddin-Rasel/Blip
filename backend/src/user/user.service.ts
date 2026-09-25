import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

export interface UserDiscoveryResult {
  id: string;
  name: string;
  avatar: string | null;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async discover(
    currentUserId: string,
    phoneNumber: string,
  ): Promise<UserDiscoveryResult | null> {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
      select: { id: true, name: true, avatar: true },
    });

    if (!user || user.id === currentUserId) return null;
    return { id: user.id, name: user.name, avatar: user.avatar };
  }
}
