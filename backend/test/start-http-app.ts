import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { configureBodyLimit } from '../src/http-body-limit';

export async function startHttpApp(app: NestExpressApplication): Promise<void> {
  configureBodyLimit(app);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Supertest must use one listener instead of opening and closing it per request.
  await app.listen(0, '127.0.0.1');
}
