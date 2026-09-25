import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma.service';
import { RATE_POLICIES } from '../src/rate-limit/rate-limit.guard';
import { startHttpApp } from './start-http-app';

type Identity = { firebaseUid: string; phoneNumber: string };
type Session = {
  user: {
    id: string;
    name: string;
    phoneNumber: string;
    avatar: string | null;
  };
  accessToken: string;
};

describe('Blip session lifecycle (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const identities = new Map<string, Identity>();
  const createdUids: string[] = [];
  let number = 6000;
  const identity = (phoneNumber = `+1415555${++number}`) => {
    const idToken = randomUUID();
    const firebaseUid = randomUUID();
    identities.set(idToken, { firebaseUid, phoneNumber });
    createdUids.push(firebaseUid);
    return { idToken, firebaseUid, phoneNumber };
  };
  const cookie = (response: request.Response) => {
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie?.[0]).toContain('refresh_token=');
    return setCookie[0].split(';')[0];
  };
  const signup = (idToken: string, name = 'Alice') =>
    request(app.getHttpServer()).post('/auth/signup').send({ idToken, name });
  const signin = (idToken: string) =>
    request(app.getHttpServer()).post('/auth/signin').send({ idToken });
  const refresh = (credential: string) =>
    request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', credential);
  const logout = (credential: string) =>
    request(app.getHttpServer()).post('/auth/logout').set('Cookie', credential);

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error(
        'TEST_DATABASE_URL must point to an isolated test database',
      );
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm6-test-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm6-test-refresh-secret';
    process.env.ACCESSTOKEN_EXPIRY = '2s';
    process.env.REFRESHTOKEN_EXPIRY = '7d';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FirebaseService)
      .useValue({
        verifyPhoneIdentity: jest.fn((token: string) => {
          const result = identities.get(token);
          if (!result)
            throw new UnauthorizedException('Phone verification failed');
          return Promise.resolve(result);
        }),
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    await startHttpApp(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma)
      await prisma.user.deleteMany({
        where: { firebaseUid: { in: createdUids } },
      });
    await app?.close();
  });

  it('binds UID to one account, updates verified phone, and keeps private fields out of responses', async () => {
    const first = identity();
    const registered = await signup(first.idToken).expect(201);
    const body = registered.body as Session;
    expect(body.user.phoneNumber).toBe(first.phoneNumber);
    expect(body.user.name).toBe('Alice');
    expect(body.accessToken).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(
      /firebaseUid|hashedRefreshToken|refreshToken/,
    );
    expect(cookie(registered)).toContain('refresh_token=');
    expect(
      (registered.headers['set-cookie'] as unknown as string[])[0],
    ).toMatch(/HttpOnly.*SameSite=Lax/);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { firebaseUid: first.firebaseUid },
    });
    expect(stored.id).toBe(body.user.id);
    expect(stored.hashedRefreshToken).toMatch(/^\$argon2id\$/);
    await expect(
      prisma.user.create({
        data: {
          firebaseUid: first.firebaseUid,
          phoneNumber: `+1415555${++number}`,
          name: 'Duplicate UID',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const nextPhone = `+1415555${++number}`;
    const changedToken = randomUUID();
    identities.set(changedToken, {
      firebaseUid: first.firebaseUid,
      phoneNumber: nextPhone,
    });
    const returned = await signin(changedToken).expect(201);
    expect((returned.body as Session).user).toMatchObject({
      id: stored.id,
      phoneNumber: nextPhone,
    });
    expect(
      await prisma.user.count({ where: { firebaseUid: first.firebaseUid } }),
    ).toBe(1);
    const profile = await request(app.getHttpServer())
      .post('/auth/me')
      .set('Authorization', `Bearer ${(returned.body as Session).accessToken}`)
      .expect(201);
    expect(JSON.stringify(profile.body)).not.toMatch(
      /firebaseUid|hashedRefreshToken/,
    );

    const conflict = identity(nextPhone);
    await signup(conflict.idToken).expect(409);
    expect(
      await prisma.user.count({ where: { firebaseUid: conflict.firebaseUid } }),
    ).toBe(0);
    await signup(identity(first.phoneNumber).idToken).expect(201);
    await signin(first.idToken).expect(409);
    await signin('unverified-token').expect(401);
  });

  it('keeps the credential stable across concurrent refresh and rejects invalid or expired credentials', async () => {
    const first = identity();
    const registered = await signup(first.idToken).expect(201);
    const credential = cookie(registered);
    const before = await prisma.user.findUniqueOrThrow({
      where: { firebaseUid: first.firebaseUid },
    });
    const [a, b] = await Promise.all([
      refresh(credential),
      refresh(credential),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((a.body as Session).user.id).toBe(before.id);
    expect((b.body as Session).user.id).toBe(before.id);
    expect(a.headers['set-cookie']).toBeUndefined();
    expect(b.headers['set-cookie']).toBeUndefined();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: before.id } }))
        .hashedRefreshToken,
    ).toBe(before.hashedRefreshToken);
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    await refresh('refresh_token=invalid').expect(401);
    const expired = new JwtService().sign(
      { sub: before.id, jti: randomUUID() },
      { secret: process.env.REFRESHTOKEN_SECRET, expiresIn: -1 },
    );
    await refresh(`refresh_token=${expired}`).expect(401);
    await prisma.user.update({
      where: { id: before.id },
      data: { hashedRefreshToken: 'wrong-hash' },
    });
    await refresh(credential).expect(401);
  });

  it('replaces the old lineage; stale logout cannot revoke the new credential', async () => {
    const first = identity();
    const old = await signup(first.idToken).expect(201);
    const oldCookie = cookie(old);
    const current = await signin(first.idToken).expect(201);
    const currentCookie = cookie(current);
    expect(currentCookie).not.toBe(oldCookie);
    await refresh(oldCookie).expect(401);
    await logout(oldCookie).expect(201);
    await refresh(currentCookie).expect(201);
    const revoked = await logout(currentCookie).expect(201);
    expect((revoked.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /refresh_token=;.*Expires=Thu, 01 Jan 1970/,
    );
    await refresh(currentCookie).expect(401);
  });

  it('rejects a refresh after the account is deleted', async () => {
    const first = identity();
    const registered = await signup(first.idToken).expect(201);
    await prisma.user.delete({ where: { firebaseUid: first.firebaseUid } });
    await refresh(cookie(registered)).expect(401);
  });

  it('expires the old access JWT and gives a fresh JWT after refresh', async () => {
    const first = identity();
    const registered = await signup(first.idToken).expect(201);
    const oldAccess = (registered.body as Session).accessToken;
    await request(app.getHttpServer())
      .post('/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`)
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await request(app.getHttpServer())
      .post('/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`)
      .expect(401);
    const renewed = await refresh(cookie(registered)).expect(201);
    const newAccess = (renewed.body as Session).accessToken;
    expect(newAccess).not.toBe(oldAccess);
    await request(app.getHttpServer())
      .post('/auth/me')
      .set('Authorization', `Bearer ${newAccess}`)
      .expect(201);
  });

  it('bounds repeated auth exchange but keeps refresh and logout usable', async () => {
    const first = identity();
    const registered = await signup(first.idToken).expect(201);
    const credential = cookie(registered);
    let blocked: request.Response | undefined;
    for (let attempt = 0; attempt < RATE_POLICIES.auth.limit; attempt++) {
      const response = await signin('unverified-token');
      if (response.status === 429) {
        blocked = response;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(blocked?.status).toBe(429);
    expect(blocked?.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    });
    expect(Number(blocked?.headers['retry-after'])).toBeGreaterThan(0);
    await refresh(credential).expect(201);
    await logout(credential).expect(201);
  });
});
