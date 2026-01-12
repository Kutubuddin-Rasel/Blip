import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/prisma.service';
import { PasswordService } from '../services/password.service';
import { Request } from 'express';
import { CookieService } from '../services/cookie.service';
import { StringValue } from 'ms';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../../interfaces/AuthUser.interface';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly cookieService: CookieService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => this.cookieService.extractRefreshToken(req),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<StringValue>('REFRESHTOKEN_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = this.cookieService.extractRefreshToken(req);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('User not found or no refresh token');
    }
    const matchToken = await this.passwordService.verify(
      refreshToken,
      user.hashedRefreshToken,
    );

    if (!matchToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { id: user.id, name: user.name, email: user.email };
  }
}
