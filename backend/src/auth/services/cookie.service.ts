import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { sessionDuration } from '../session-duration';

export interface AuthCookies {
  refresh_token?: string;
}

@Injectable()
export class CookieService {
  private readonly isProduction: boolean;
  private readonly refreshMaxAge: number;
  constructor(private readonly configService: ConfigService) {
    this.isProduction = configService.get<string>('NODE_ENV') === 'production';
    this.refreshMaxAge = sessionDuration(
      configService,
      'REFRESHTOKEN_EXPIRY',
      30 * 24 * 60 * 60 * 1000,
    ).milliseconds;
  }

  setAuthCookies(res: Response, refreshToken: string): void {
    const secure = this.isProduction;
    const sameSite: 'strict' | 'lax' | 'none' = secure ? 'strict' : 'lax';
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: this.refreshMaxAge,
      path: '/auth',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie('refresh_token', {
      path: '/auth',
      sameSite: this.isProduction ? 'strict' : 'lax',
      secure: this.isProduction,
      httpOnly: true,
    });
  }

  extractRefreshToken(req: Request): string | null {
    const cookies = req.cookies as Partial<AuthCookies> | undefined;
    if (!cookies) {
      return null;
    }
    const refreshToken = cookies['refresh_token'];
    if (!refreshToken || typeof refreshToken != 'string') {
      return null;
    }
    return refreshToken;
  }
}
