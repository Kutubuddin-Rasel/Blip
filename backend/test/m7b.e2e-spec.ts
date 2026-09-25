import { randomUUID } from 'node:crypto';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma.service';
import { RATE_POLICIES } from '../src/rate-limit/rate-limit.guard';

describe('M7B blocking and account deletion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let socket: Socket;
  let secondSocket: Socket;
  const identities = new Map<
    string,
    { firebaseUid: string; phoneNumber: string }
  >();
  const ids: string[] = [];
  const first = {
    idToken: randomUUID(),
    firebaseUid: randomUUID(),
    phoneNumber: '+14155559001',
  };
  const second = {
    idToken: randomUUID(),
    firebaseUid: randomUUID(),
    phoneNumber: '+14155559002',
  };
  identities.set(first.idToken, first);
  identities.set(second.idToken, second);
  let a: { id: string; access: string; cookie: string };
  let b: { id: string; access: string; cookie: string };
  let conversationId: string;
  let committedId: string;
  const bearer = (token: string) => `Bearer ${token}`;
  const cookie = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  const body = <T>(response: request.Response): T => response.body as T;
  type SessionBody = { user: { id: string }; accessToken: string };
  const signup = (identity: typeof first, name: string) =>
    request(app.getHttpServer())
      .post('/auth/signup')
      .send({ idToken: identity.idToken, name });
  const discover = (token: string, phoneNumber: string) =>
    request(app.getHttpServer())
      .post('/user/discover')
      .set('Authorization', bearer(token))
      .send({ phoneNumber });
  const start = (token: string, recipientId: string) =>
    request(app.getHttpServer())
      .post('/conversations/create')
      .set('Authorization', bearer(token))
      .send({ recipientId });
  const send = (
    token: string,
    userConversationId: string,
    clientMessageId = randomUUID(),
    content = 'hello',
  ) =>
    request(app.getHttpServer())
      .post('/messages')
      .set('Authorization', bearer(token))
      .send({ conversationId: userConversationId, clientMessageId, content });
  const detail = (token: string) =>
    request(app.getHttpServer())
      .get(`/conversations/${conversationId}`)
      .set('Authorization', bearer(token));

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('TEST_DATABASE_URL required');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm7b-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm7b-refresh-secret';
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
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0);
    prisma = app.get(PrismaService);
    const aa = await signup(first, 'Alice').expect(201);
    const bb = await signup(second, 'Bob').expect(201);
    a = {
      id: body<SessionBody>(aa).user.id,
      access: body<SessionBody>(aa).accessToken,
      cookie: cookie(aa),
    };
    b = {
      id: body<SessionBody>(bb).user.id,
      access: body<SessionBody>(bb).accessToken,
      cookie: cookie(bb),
    };
    ids.push(a.id, b.id);
  });

  afterAll(async () => {
    socket?.disconnect();
    secondSocket?.disconnect();
    if (prisma && ids.length) {
      await prisma.message.deleteMany({ where: { userId: { in: ids } } });
      await prisma.conversation.deleteMany({
        where: {
          directKey: { not: null },
          users: { some: { id: { in: ids } } },
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('enforces either-direction blocks while preserving history and committed replay', async () => {
    expect(
      body<{ id: string }>(
        await discover(a.access, second.phoneNumber).expect(200),
      ).id,
    ).toBe(b.id);
    const clientMessageId = randomUUID();
    const created = await request(app.getHttpServer())
      .post('/conversations/create')
      .set('Authorization', bearer(a.access))
      .send({
        recipientId: b.id,
        initialMessage: 'Before block',
        clientMessageId,
      })
      .expect(201);
    conversationId = body<{ conversation: { id: string } }>(created)
      .conversation.id;
    committedId = body<{ message: { id: string } }>(created).message.id;
    const before = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { lastMessageAt: true },
    });
    const count = await prisma.message.count({ where: { conversationId } });

    const block = () =>
      request(app.getHttpServer())
        .post(`/users/${b.id}/block`)
        .set('Authorization', bearer(a.access));
    expect((await block().expect(201)).body).toEqual({ blocked: true });
    expect((await block().expect(201)).body).toEqual({ blocked: true });
    await request(app.getHttpServer())
      .post(`/users/${a.id}/block`)
      .set('Authorization', bearer(a.access))
      .expect(400);
    expect(
      (await discover(a.access, second.phoneNumber).expect(200)).body,
    ).toBeNull();
    expect(
      (await discover(b.access, first.phoneNumber).expect(200)).body,
    ).toBeNull();
    await start(a.access, b.id).expect(404);
    await start(b.access, a.id).expect(404);
    const deniedA = await send(a.access, conversationId).expect(404);
    const deniedB = await send(b.access, conversationId).expect(404);
    expect(body<{ message: string }>(deniedA).message).toBe(
      body<{ message: string }>(deniedB).message,
    );
    expect(await prisma.message.count({ where: { conversationId } })).toBe(
      count,
    );
    expect(
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: conversationId },
          select: { lastMessageAt: true },
        })
      ).lastMessageAt,
    ).toEqual(before.lastMessageAt);
    expect(
      (
        await send(
          a.access,
          conversationId,
          clientMessageId,
          'Before block',
        ).expect(201)
      ).body as { id: string },
    ).toMatchObject({ id: committedId });
    const own = (await detail(a.access).expect(200)).body as Record<
      string,
      unknown
    >;
    const peer = (await detail(b.access).expect(200)).body as Record<
      string,
      unknown
    >;
    expect(own).toMatchObject({ canMessage: false, blockedByMe: true });
    expect(peer).toMatchObject({ canMessage: false, blockedByMe: false });
    expect(JSON.stringify(peer)).not.toMatch(
      /blockedByPeer|blockerId|firebaseUid|phoneNumber/,
    );
    expect(
      (
        await request(app.getHttpServer())
          .get(`/messages/${conversationId}`)
          .set('Authorization', bearer(b.access))
          .expect(200)
      ).body as { items: unknown[] },
    ).toMatchObject({ items: [expect.any(Object)] });
    const unblock = () =>
      request(app.getHttpServer())
        .delete(`/users/${b.id}/block`)
        .set('Authorization', bearer(a.access));
    expect((await unblock().expect(200)).body).toEqual({ blocked: false });
    expect((await unblock().expect(200)).body).toEqual({ blocked: false });
    expect(
      body<{ senderId: string }>(
        await send(b.access, conversationId).expect(201),
      ).senderId,
    ).toBe(b.id);
  });

  it('requires a matching refresh session, tombstones atomically, disconnects sockets and permits new registration', async () => {
    await request(app.getHttpServer())
      .post(`/users/${a.id}/block`)
      .set('Authorization', bearer(b.access))
      .expect(201);
    await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', bearer(a.access))
      .expect(401);
    await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Cookie', a.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', bearer(a.access))
      .set('Cookie', b.cookie)
      .expect(401);
    const rotated = await request(app.getHttpServer())
      .post('/auth/signin')
      .send({ idToken: first.idToken })
      .expect(201);
    const currentCookie = cookie(rotated);
    const currentAccess = body<SessionBody>(rotated).accessToken;
    await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', bearer(currentAccess))
      .set('Cookie', a.cookie)
      .expect(401);
    let limited = false;
    for (let attempt = 0; attempt <= RATE_POLICIES.discovery.limit; attempt++) {
      const response = await discover(currentAccess, second.phoneNumber);
      if (response.status === 429) limited = true;
    }
    expect(limited).toBe(true);
    const socketOptions = {
      autoConnect: false,
      transports: ['websocket'] as ['websocket'],
      auth: { token: currentAccess },
    };
    socket = io(await app.getUrl(), socketOptions);
    secondSocket = io(await app.getUrl(), socketOptions);
    const connect = (client: Socket) =>
      new Promise<void>((resolve, reject) => {
        client.once('connect', () => resolve());
        client.once('connect_error', reject);
        client.connect();
      });
    await Promise.all([connect(socket), connect(secondSocket)]);
    const disconnected = new Promise<void>((resolve) =>
      socket.once('disconnect', () => resolve()),
    );
    const secondDisconnected = new Promise<void>((resolve) =>
      secondSocket.once('disconnect', () => resolve()),
    );
    expect(
      (
        await request(app.getHttpServer())
          .delete('/auth/account')
          .set('Authorization', bearer(currentAccess))
          .set('Cookie', currentCookie)
          .expect(200)
      ).body,
    ).toEqual({ deleted: true });
    await Promise.all([disconnected, secondDisconnected]);
    expect(socket.connected).toBe(false);
    expect(secondSocket.connected).toBe(false);
    await expect(
      new Promise<string>((resolve) => {
        socket.once('connect_error', (error: Error) => resolve(error.message));
        socket.connect();
      }),
    ).resolves.toBe('Unauthorized');
    socket.disconnect();
    const tombstone = await prisma.user.findUniqueOrThrow({
      where: { id: a.id },
    });
    expect(tombstone).toMatchObject({
      firebaseUid: null,
      phoneNumber: null,
      name: 'Deleted user',
      avatar: null,
      hashedRefreshToken: null,
    });
    expect(tombstone.deletedAt).toBeInstanceOf(Date);
    expect(
      await prisma.block.count({
        where: { OR: [{ blockerId: a.id }, { blockedId: a.id }] },
      }),
    ).toBe(0);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', currentCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/me')
      .set('Authorization', bearer(currentAccess))
      .expect(401);
    await send(currentAccess, conversationId).expect(401);
    expect((await detail(b.access).expect(200)).body).toMatchObject({
      peer: { id: a.id, name: 'Deleted user', avatar: null, isDeleted: true },
      canMessage: false,
    });
    expect(
      (
        await request(app.getHttpServer())
          .get('/conversations')
          .set('Authorization', bearer(b.access))
          .expect(200)
      ).body,
    ).toEqual([
      expect.objectContaining({
        peer: { id: a.id, name: 'Deleted user', avatar: null, isDeleted: true },
      }),
    ]);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/messages/${conversationId}`)
          .set('Authorization', bearer(b.access))
          .expect(200)
      ).body as { items: unknown[] },
    ).toMatchObject({ items: [expect.any(Object), expect.any(Object)] });
    expect(await prisma.message.count({ where: { conversationId } })).toBe(2);
    expect(
      await prisma.conversation.count({ where: { id: conversationId } }),
    ).toBe(1);
    expect(
      (await discover(b.access, first.phoneNumber).expect(200)).body,
    ).toBeNull();
    await start(b.access, a.id).expect(404);
    await send(b.access, conversationId).expect(404);
    await request(app.getHttpServer())
      .post(`/users/${a.id}/block`)
      .set('Authorization', bearer(b.access))
      .expect(404);
    const again = await signup(first, 'New Alice').expect(201);
    const newId = body<SessionBody>(again).user.id;
    ids.push(newId);
    expect(newId).not.toBe(a.id);
    expect(
      body<{ id: string }>(
        await discover(b.access, first.phoneNumber).expect(200),
      ).id,
    ).toBe(newId);
    expect(
      (
        await request(app.getHttpServer())
          .get('/conversations')
          .set('Authorization', bearer(body<SessionBody>(again).accessToken))
          .expect(200)
      ).body,
    ).toEqual([]);
    expect(
      JSON.stringify((await detail(b.access).expect(200)).body),
    ).not.toMatch(/firebaseUid|phoneNumber|blockedByPeer/);
  });
});
