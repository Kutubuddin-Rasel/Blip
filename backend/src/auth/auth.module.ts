import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './services/password.service';
import { CookieService } from './services/cookie.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from 'src/prisma.service';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { RedisModule } from 'src/redis/redis.module';
import { FirebaseModule } from 'src/firebase/firebase.module';

@Module({
  imports: [JwtModule.register({}), RedisModule, FirebaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    CookieService,
    JwtStrategy,
    PrismaService,
    RefreshTokenStrategy,
  ],
})
export class AuthModule {}
