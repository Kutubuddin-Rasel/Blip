import type { NestExpressApplication } from '@nestjs/platform-express';

export const JSON_BODY_LIMIT = '16kb';

export function configureBodyLimit(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: JSON_BODY_LIMIT });
}
