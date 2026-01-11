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
import { RefreshTokenGuard } from './guards/refresh-token.guard';

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

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exists');
    }
    await this.authService.logout(userId);
    this.cookieService.clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.id;
    const username = req.user?.name;
    if (!userId || !username) {
      throw new UnauthorizedException('User no longer exists');
    }
    const { accessToken, refreshToken } = await this.authService.refreshTokens({
      sub: userId,
      username,
    });
    this.cookieService.setAuthCookies(res, refreshToken);
    return { accessToken };
  }
}
