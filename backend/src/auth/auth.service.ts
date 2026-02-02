import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { PasswordService } from 'src/auth/services/password.service';
import { SignInDto } from 'src/auth/dto/signin.dto';
import { SignUpDto } from 'src/auth/dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';
import {
  AuthUser,
  JwtPayload,
  SafeUser,
  tokens,
} from '../interfaces/AuthUser.interface';
import { RedisService } from 'src/redis/redis.service';
import { CacheOptions } from 'src/interfaces/Redis.interface';
import { FirebaseService } from 'src/firebase/firebase.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly firebaseService: FirebaseService,
  ) { }

  async verifyIdToken(idToken: string) {
    try {
      const decodedToken = await this.firebaseService
        .getAuth()
        .verifyIdToken(idToken);
      return decodedToken;
    } catch {
      throw new UnauthorizedException('Invalid firebase token');
    }
  }
  async signUp(signUpDto: SignUpDto): Promise<SafeUser> {
    const decodedToken = await this.verifyIdToken(signUpDto.idToken);
    if (!decodedToken.phone_number) {
      throw new BadRequestException('Phone number is required for signup');
    }
    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber: decodedToken.phone_number },
    });

    if (existing) {
      throw new ConflictException('Number is already in use');
    }

    const user = await this.prisma.user.create({
      data: {
        phoneNumber: decodedToken.phone_number,
        name: signUpDto.name,
        avatar: signUpDto.avatar ?? null,
      },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        avatar: true,
      },
    });

    const { accessToken, refreshToken } = await this.getTokens({
      sub: user.id,
      username: user.name,
    });

    const updateToken = await this.updateRefreshToken(user.id, refreshToken);
    if (!updateToken) {
      throw new InternalServerErrorException();
    }
    return {
      user: user,
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  async validateUser(signInDto: SignInDto): Promise<AuthUser | null> {
    const decodedToken = await this.verifyIdToken(signInDto.idToken);
    if (!decodedToken.phone_number) {
      throw new UnauthorizedException('Invalid phone number');
    }
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: decodedToken.phone_number },
    });

    if (!user) {
      return null;
    }

    const { hashedRefreshToken, createdAt, ...result } = user;
    return result;
  }

  async signIn(signInDto: SignInDto): Promise<SafeUser> {
    const user = await this.validateUser(signInDto);
    if (!user) {
      throw new NotFoundException('User not registered');
    }
    const { accessToken, refreshToken } = await this.getTokens({
      sub: user.id,
      username: user.name,
    });

    const updateToken = await this.updateRefreshToken(user.id, refreshToken);
    if (!updateToken) {
      throw new InternalServerErrorException();
    }
    return {
      user: user,
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });

    await this.redisService.del(`userId:${userId}`);
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    try {
      const hashRefreshToken = await this.passwordService.hash(refreshToken);
      await this.prisma.user.update({
        where: { id: userId },
        data: { hashedRefreshToken: hashRefreshToken },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getTokens(payload: JwtPayload) {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('ACCESSTOKEN_SECRET'),
      expiresIn:
        this.configService.getOrThrow<StringValue>('ACCESSTOKEN_EXPIRY'),
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('REFRESHTOKEN_SECRET'),
      expiresIn: this.configService.getOrThrow<StringValue>(
        'REFRESHTOKEN_EXPIRY',
      ),
    });

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  async refreshTokens(payload: JwtPayload): Promise<tokens> {
    const { accessToken, refreshToken } = await this.getTokens(payload);
    await this.updateRefreshToken(payload.sub, refreshToken);
    return { accessToken, refreshToken };
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const data = await this.redisService.get<AuthUser>(`userId:${userId}`);
    if (data) {
      return data;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exist');
    }
    const key = `userId:${userId}`;
    const options: CacheOptions = {
      ttl: 36000,
    };
    const userData = {
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
    };
    const setUser = await this.redisService.set<AuthUser>(
      key,
      userData,
      options,
    );
    if (!setUser) {
      console.warn('Error while setting user profile data');
    }
    return userData;
  }
}
