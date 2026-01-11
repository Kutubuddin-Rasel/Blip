import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import ms from 'ms';
import { StringValue } from 'ms';

export interface AuthCookies {
  refresh_token?: string;
}

@Injectable()
export class CookieService {
  private readonly isProduction: boolean;
  constructor(private readonly configSerivce: ConfigService) {
    this.isProduction = configSerivce.get<string>('NODE_ENV') === 'production';
  }

  setAuthCookies(res: Response, refreshToken: string): void {
    const secure = this.isProduction;
    const sameSite: 'strict' | 'lax' | 'none' = secure ? 'strict' : 'lax';
    const expiry = this.configSerivce.getOrThrow<StringValue>(
      'REFRESHTOKEN_EXPIRY',
    );
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: ms(expiry),
      path: '/auth',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie('refresh_token', {
      path: '/auth',
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
