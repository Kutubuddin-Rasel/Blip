import {
  Controller,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import type { Request } from 'express';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(AccessTokenGuard)
  async findAll(@Req() req: Request, @Query('search') search: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User no longer exists');
    }
    return this.userService.findAll(userId, search);
  }
}
