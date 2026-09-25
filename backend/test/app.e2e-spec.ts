import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { startHttpApp } from './start-http-app';

describe('HTTP application wiring (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL must point to an isolated test database',
      );
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm0-test-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm0-test-refresh-secret';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FirebaseService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    await startHttpApp(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('rejects an unauthenticated conversation request', () => {
    return request(app.getHttpServer()).get('/conversations').expect(401);
  });

  it('rejects oversized JSON before auth exchange', () => {
    return request(app.getHttpServer())
      .post('/auth/signin')
      .send({ idToken: 'x'.repeat(17_000) })
      .expect(413);
  });
});
