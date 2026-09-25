import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma.service';
import { PasswordService } from './services/password.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  AuthUser,
  RefreshPayload,
  SafeUser,
} from 'src/interfaces/AuthUser.interface';
import { SignInDto } from './dto/signin.dto';
import { SignUpDto } from './dto/signup.dto';
import { sessionDuration } from './session-duration';
import { EventsGateway } from 'src/events/events.gateway';

const publicUserSelect = {
  id: true,
  name: true,
  phoneNumber: true,
  avatar: true,
} as const;

@Injectable()
export class AuthService {
  private readonly accessExpiry: StringValue;
  private readonly refreshExpiry: StringValue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly eventsGateway: EventsGateway,
  ) {
    const access = sessionDuration(
      configService,
      'ACCESSTOKEN_EXPIRY',
      60 * 60 * 1000,
    );
    const refresh = sessionDuration(
      configService,
      'REFRESHTOKEN_EXPIRY',
      30 * 24 * 60 * 60 * 1000,
    );
    if (refresh.milliseconds <= access.milliseconds)
      throw new Error('Refresh expiry must exceed access expiry');
    this.accessExpiry = access.value;
    this.refreshExpiry = refresh.value;
  }

  private async syncVerifiedPhone(
    user: { id: string; phoneNumber: string | null },
    phoneNumber: string,
  ): Promise<AuthUser> {
    if (user.phoneNumber === phoneNumber) {
      const active = await this.prisma.user.findUnique({
        where: { id: user.id, deletedAt: null },
        select: publicUserSelect,
      });
      if (!active) throw new UnauthorizedException('Account unavailable');
      return active;
    }
    try {
      return await this.prisma.user.update({
        where: { id: user.id, deletedAt: null },
        data: { phoneNumber },
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Verified phone is already linked to another account',
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new UnauthorizedException('Account unavailable');
      throw error;
    }
  }

  async signUp(dto: SignUpDto): Promise<SafeUser> {
    const identity = await this.firebaseService.verifyPhoneIdentity(
      dto.idToken,
    );
    let user = await this.prisma.user.findUnique({
      where: { firebaseUid: identity.firebaseUid, deletedAt: null },
      select: publicUserSelect,
    });
    if (user) {
      user = await this.syncVerifiedPhone(user, identity.phoneNumber);
    } else {
      try {
        user = await this.prisma.user.create({
          data: {
            firebaseUid: identity.firebaseUid,
            phoneNumber: identity.phoneNumber,
            name: dto.name,
            avatar: dto.avatar ?? null,
          },
          select: publicUserSelect,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        const winner = await this.prisma.user.findUnique({
          where: { firebaseUid: identity.firebaseUid, deletedAt: null },
          select: publicUserSelect,
        });
        if (!winner)
          throw new ConflictException(
            'Verified phone is already linked to another account',
          );
        user = await this.syncVerifiedPhone(winner, identity.phoneNumber);
      }
    }
    return this.issueSession(user);
  }

  async signIn(dto: SignInDto): Promise<SafeUser> {
    const identity = await this.firebaseService.verifyPhoneIdentity(
      dto.idToken,
    );
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: identity.firebaseUid, deletedAt: null },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not registered');
    return this.issueSession(
      await this.syncVerifiedPhone(user, identity.phoneNumber),
    );
  }

  private async issueSession(user: AuthUser): Promise<SafeUser> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.name },
      {
        secret: this.configService.getOrThrow<string>('ACCESSTOKEN_SECRET'),
        expiresIn: this.accessExpiry,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti: randomUUID() } satisfies RefreshPayload,
      {
        secret: this.configService.getOrThrow<string>('REFRESHTOKEN_SECRET'),
        expiresIn: this.refreshExpiry,
      },
    );
    const hash = await this.passwordService.hash(refreshToken);
    try {
      await this.prisma.user.update({
        where: { id: user.id, deletedAt: null },
        data: { hashedRefreshToken: hash },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new UnauthorizedException('Account unavailable');
      throw error;
    }
    return { user, accessToken, refreshToken };
  }

  async refreshTokens(
    rawToken: string | null,
  ): Promise<{ user: AuthUser; accessToken: string }> {
    if (!rawToken) throw new UnauthorizedException('Session unavailable');
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(rawToken, {
        secret: this.configService.getOrThrow<string>('REFRESHTOKEN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session unavailable');
    }
    if (!payload.sub || !payload.jti)
      throw new UnauthorizedException('Session unavailable');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: { ...publicUserSelect, hashedRefreshToken: true },
    });
    if (
      !user?.hashedRefreshToken ||
      !(await this.passwordService.verify(rawToken, user.hashedRefreshToken))
    ) {
      throw new UnauthorizedException('Session unavailable');
    }
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.name },
      {
        secret: this.configService.getOrThrow<string>('ACCESSTOKEN_SECRET'),
        expiresIn: this.accessExpiry,
      },
    );
    return {
      user: {
        id: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        avatar: user.avatar,
      },
      accessToken,
    };
  }

  async logout(rawToken: string | null): Promise<void> {
    if (!rawToken) return;
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(rawToken, {
        secret: this.configService.getOrThrow<string>('REFRESHTOKEN_SECRET'),
      });
    } catch {
      return;
    }
    if (!payload.sub || !payload.jti) return;
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { hashedRefreshToken: true },
    });
    if (
      !user?.hashedRefreshToken ||
      !(await this.passwordService.verify(rawToken, user.hashedRefreshToken))
    )
      return;
    await this.prisma.user.updateMany({
      where: { id: payload.sub, hashedRefreshToken: user.hashedRefreshToken },
      data: { hashedRefreshToken: null },
    });
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: publicUserSelect,
    });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }

  async deleteAccount(userId: string, rawToken: string | null): Promise<void> {
    if (!rawToken) throw new UnauthorizedException('Current session required');
    let payload: RefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(rawToken, {
        secret: this.configService.getOrThrow<string>('REFRESHTOKEN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Current session required');
    }
    if (payload.sub !== userId || !payload.jti)
      throw new UnauthorizedException('Current session required');
    await this.prisma.$transaction(async (tx) => {
      // Serialize with refresh rotation, sends and block changes for this user.
      const users = await tx.$queryRaw<
        { id: string; hashedRefreshToken: string | null }[]
      >`
        SELECT id, "hashedRefreshToken" FROM "User"
        WHERE id = ${userId}::uuid AND "deletedAt" IS NULL FOR UPDATE
      `;
      const user = users[0];
      if (
        !user?.hashedRefreshToken ||
        !(await this.passwordService.verify(rawToken, user.hashedRefreshToken))
      )
        throw new UnauthorizedException('Current session required');
      await tx.block.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      });
      await tx.user.update({
        where: { id: userId, deletedAt: null },
        data: {
          firebaseUid: null,
          phoneNumber: null,
          name: 'Deleted user',
          avatar: null,
          hashedRefreshToken: null,
          deletedAt: new Date(),
        },
      });
    });
    this.eventsGateway.disconnectUser(userId);
  }
}
