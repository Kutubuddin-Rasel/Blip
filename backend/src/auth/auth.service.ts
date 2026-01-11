import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { PasswordService } from 'src/auth/services/password.service';
import { SafeUser } from 'src/auth/types/safe-user.interface';
import { SignInDto } from 'src/auth/dto/signin.dto';
import { SignUpDto } from 'src/auth/dto/signup.dto';
import { JwtPayload, VerifiedUser } from './types/jwt-request-uset.interface';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: signUpDto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const hash = await this.passwordService.hash(signUpDto.password);
    const user = await this.prisma.user.create({
      data: {
        email: signUpDto.email.toLowerCase(),
        hashedPassword: hash,
        name: signUpDto.name,
        avatar: signUpDto.avatar ?? null,
      },
      select: {
        id: true,
        email: true,
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

  async signIn(signInDto: SignInDto): Promise<SafeUser> {
    const user = await this.validateUser(signInDto);
    if (user == null) {
      throw new UnauthorizedException('Email or password is incorrect');
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

  async validateUser(signInDto: SignInDto): Promise<VerifiedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: signInDto.email.toLowerCase() },
    });

    if (!user) {
      return null;
    }

    const verifyPassword = await this.passwordService.verify(
      signInDto.password,
      user.hashedPassword,
    );

    if (!verifyPassword) {
      return null;
    }
    const { hashedPassword, hashedRefreshToken, ...result } = user;
    return result;
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

  async refreshTokens(payload: JwtPayload) {
    const { accessToken, refreshToken } = await this.getTokens(payload);
    await this.updateRefreshToken(payload.sub, refreshToken);
    return { accessToken, refreshToken };
  }
}
