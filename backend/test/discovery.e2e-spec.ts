import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma.service';
import { RATE_POLICIES } from '../src/rate-limit/rate-limit.guard';
import { directKey } from '../src/conversations/direct-key';
import { startHttpApp } from './start-http-app';

describe('Exact recipient discovery (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let aliceId: string;
  let bobId: string;
  let limiterUserId: string;
  let aliceToken: string;
  let limiterToken: string;
  let conversationId: string;
  const alicePhone = '+14155552671';
  const bobPhone = '+14155552672';
  const unknownPhone = '+14155552673';

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL must point to an isolated test database',
      );
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm1-test-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm1-test-refresh-secret';
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FirebaseService)
      .useValue({})
      .compile();
    app = fixture.createNestApplication<NestExpressApplication>();
    await startHttpApp(app);
    prisma = app.get(PrismaService);
    const alice = await prisma.user.create({
      data: {
        id: randomUUID(),
        firebaseUid: randomUUID(),
        name: 'Alice',
        phoneNumber: alicePhone,
      },
    });
    const bob = await prisma.user.create({
      data: {
        id: randomUUID(),
        firebaseUid: randomUUID(),
        name: 'Bob',
        phoneNumber: bobPhone,
        avatar: 'https://example.test/bob.png',
      },
    });
    const limiterUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        firebaseUid: randomUUID(),
        name: 'Limiter',
        phoneNumber: '+14155552674',
      },
    });
    aliceId = alice.id;
    bobId = bob.id;
    limiterUserId = limiterUser.id;
    const jwt = new JwtService();
    aliceToken = jwt.sign(
      { sub: aliceId, username: 'Alice' },
      { secret: process.env.ACCESSTOKEN_SECRET },
    );
    limiterToken = jwt.sign(
      { sub: limiterUserId, username: 'Limiter' },
      { secret: process.env.ACCESSTOKEN_SECRET },
    );
    const conversation = await prisma.conversation.create({
      data: {
        directKey: directKey(aliceId, bobId),
        users: { connect: [{ id: aliceId }, { id: bobId }] },
      },
    });
    conversationId = conversation.id;
  });

  afterAll(async () => {
    if (conversationId)
      await prisma.conversation.delete({ where: { id: conversationId } });
    if (aliceId) {
      await prisma.user.deleteMany({
        where: { id: { in: [aliceId, bobId, limiterUserId] } },
      });
    }
    await app?.close();
  });

  const lookup = (token: string, phoneNumber: string) =>
    request(app.getHttpServer())
      .post('/user/discover')
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber });

  it('requires authentication and leaves neither old directory reachable', async () => {
    await request(app.getHttpServer())
      .post('/user/discover')
      .send({ phoneNumber: bobPhone })
      .expect(401);
    await request(app.getHttpServer())
      .get('/user')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);
  });

  it.each([
    ['blank phone', ''],
    ['partial phone', '+1415'],
    ['name', 'Bob'],
    ['noncanonical phone', '14155552672'],
  ])('rejects %s', async (_label, phoneNumber) => {
    await lookup(aliceToken, phoneNumber).expect(400);
  });

  it('rejects extra search parameters', async () => {
    await request(app.getHttpServer())
      .post('/user/discover')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ phoneNumber: bobPhone, search: 'Bob' })
      .expect(400);
  });

  it('does not expose a GET discovery endpoint', async () => {
    await request(app.getHttpServer())
      .get('/user/discover')
      .set('Authorization', `Bearer ${aliceToken}`)
      .query({ phoneNumber: bobPhone })
      .expect(404);
  });

  it('returns exactly the safe identity for a known E.164 number', async () => {
    const response = await lookup(aliceToken, bobPhone).expect(200);
    expect(response.body).toEqual({
      id: bobId,
      name: 'Bob',
      avatar: 'https://example.test/bob.png',
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /phoneNumber|firebase|refresh|createdAt/,
    );
  });

  it('returns the same empty result for unknown and self lookup', async () => {
    const unknown = await lookup(aliceToken, unknownPhone).expect(200);
    const self = await lookup(aliceToken, alicePhone).expect(200);
    expect(unknown.headers['content-type']).toMatch(/application\/json/);
    expect(unknown.text).toBe('null');
    expect(self.text).toBe('null');
  });

  it('does not expose peer phone numbers through conversation lists', async () => {
    const response = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const conversations = response.body as Array<{
      id: string;
      peer: { id: string; name: string; avatar: string | null };
    }>;
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );
    expect(conversation?.peer).toEqual({
      id: bobId,
      name: 'Bob',
      avatar: 'https://example.test/bob.png',
      isDeleted: false,
    });
  });

  it('enforces the configured per-user limit at the boundary', async () => {
    await lookup(limiterToken, 'invalid').expect(400);
    for (let attempt = 1; attempt < RATE_POLICIES.discovery.limit; attempt++) {
      await lookup(limiterToken, unknownPhone).expect(200);
    }
    const blocked = await lookup(limiterToken, unknownPhone).expect(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await lookup(aliceToken, unknownPhone).expect(200);
  });
});
