import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './services/password.service';
import { CookieService } from './services/cookie.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from 'src/prisma.service';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { EventsModule } from 'src/events/events.module';

@Module({
  imports: [JwtModule.register({}), FirebaseModule, EventsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    CookieService,
    JwtStrategy,
    PrismaService,
  ],
})
export class AuthModule {}
