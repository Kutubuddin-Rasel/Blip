import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from 'src/auth/dto/signup.dto';
import { SignInDto } from 'src/auth/dto/signin.dto';
import { CookieService } from './services/cookie.service';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from './guards/access-token.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
  ) {}

  @Post('signup')
  async signUp(
    @Body() signUpDto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signUp(signUpDto);
    this.cookieService.setAuthCookies(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
      message: 'User registered',
    };
  }

  @Post('signin')
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(signInDto);
    this.cookieService.setAuthCookies(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
      message: 'Login Succesful',
    };
  }

  @Post('refresh')
  async refreshTokens(@Req() req: Request) {
    return this.authService.refreshTokens(
      this.cookieService.extractRefreshToken(req),
    );
  }

  @UseGuards(AccessTokenGuard)
  @Post('me')
  async getProfile(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exist');
    }
    const result = await this.authService.getProfile(userId);
    return result;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      await this.authService.logout(
        this.cookieService.extractRefreshToken(req),
      );
    } finally {
      this.cookieService.clearAuthCookies(res);
    }
    return { message: 'Logged out successfully' };
  }
}
