import {
  Controller,
  HttpCode,
  Body,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import { IsPhoneNumber, Matches } from 'class-validator';
import { DiscoveryRateLimitGuard } from './discovery-rate-limit.guard';

class DiscoverRecipientBody {
  // Firebase stores the verified phone claim as E.164. Require that same wire form.
  @Matches(/^\+[1-9]\d{1,14}$/)
  @IsPhoneNumber()
  phoneNumber!: string;
}

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('discover')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, DiscoveryRateLimitGuard)
  async discover(
    @Req() req: Request,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    body: DiscoverRecipientBody,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exists');
    }
    const result = await this.userService.discover(userId, body.phoneNumber);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  }
}
