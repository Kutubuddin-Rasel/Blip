import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RelationshipService } from 'src/relationship/relationship.service';

export interface UserDiscoveryResult {
  id: string;
  name: string;
  avatar: string | null;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipService,
  ) {}

  async discover(
    currentUserId: string,
    phoneNumber: string,
  ): Promise<UserDiscoveryResult | null> {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
      select: { id: true, name: true, avatar: true, deletedAt: true },
    });

    if (
      !user ||
      user.deletedAt ||
      user.id === currentUserId ||
      (await this.relationships.isBlocked(currentUserId, user.id))
    )
      return null;
    return { id: user.id, name: user.name, avatar: user.avatar };
  }
}
