import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma.service';
import { directKey } from '../src/conversations/direct-key';
import type { StartDirectResult } from '../src/interfaces/Conversation.interface';
import { RATE_POLICIES } from '../src/rate-limit/rate-limit.guard';

describe('Direct conversation contracts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const [aliceId, bobId, carolId, danId, erinId] = Array.from(
    { length: 5 },
    () => randomUUID(),
  );
  const [directId, emptyId, otherId, selfId, groupId] = Array.from(
    { length: 5 },
    () => randomUUID(),
  );
  const messageId = randomUUID();
  const tiedMessageId = randomUUID();
  const messageAt = new Date('2026-09-01T12:00:00.000Z');
  const fixtureUserIds = [aliceId, bobId, carolId, danId, erinId];
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL must point to an isolated test database',
      );
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm2-test-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm2-test-refresh-secret';
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FirebaseService)
      .useValue({})
      .compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.createMany({
      data: [
        {
          id: aliceId,
          firebaseUid: aliceId,
          name: 'Alice',
          phoneNumber: '+14155552701',
        },
        {
          id: bobId,
          firebaseUid: bobId,
          name: 'Bob',
          phoneNumber: '+14155552702',
          avatar: 'https://example.test/bob.png',
        },
        {
          id: carolId,
          firebaseUid: carolId,
          name: 'Carol',
          phoneNumber: '+14155552703',
        },
        {
          id: danId,
          firebaseUid: danId,
          name: 'Dan',
          phoneNumber: '+14155552704',
        },
        {
          id: erinId,
          firebaseUid: erinId,
          name: 'Erin',
          phoneNumber: '+14155552705',
        },
      ],
    });
    const jwt = new JwtService();
    const sign = (id: string) =>
      jwt.sign({ sub: id }, { secret: process.env.ACCESSTOKEN_SECRET });
    aliceToken = sign(aliceId);
    bobToken = sign(bobId);
    carolToken = sign(carolId);

    for (const [id, users] of [
      [directId, [aliceId, bobId]],
      [emptyId, [aliceId, danId]],
      [otherId, [bobId, danId]],
      [selfId, [aliceId]],
      [groupId, [aliceId, bobId, carolId]],
    ] as Array<[string, string[]]>) {
      await prisma.conversation.create({
        data: {
          id,
          directKey: users.length === 2 ? directKey(users[0], users[1]) : null,
          users: { connect: users.map((userId) => ({ id: userId })) },
        },
      });
    }
    await prisma.message.create({
      data: {
        id: messageId,
        clientMessageId: randomUUID(),
        content: 'Persisted hello',
        createdAt: messageAt,
        userId: bobId,
        conversationId: directId,
      },
    });
    await prisma.message.create({
      data: {
        id: tiedMessageId,
        clientMessageId: randomUUID(),
        content: 'Same timestamp',
        createdAt: messageAt,
        userId: danId,
        conversationId: otherId,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.message.deleteMany({
        where: { userId: { in: fixtureUserIds } },
      });
      await prisma.conversation.deleteMany({
        where: { users: { some: { id: { in: fixtureUserIds } } } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: fixtureUserIds } },
      });
    }
    await app?.close();
  });

  const getList = (token: string) =>
    request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${token}`);
  const getDetail = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/conversations/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const start = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/conversations/create')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('lists only supported direct chats with safe summaries and nullable latest message', async () => {
    const response = await getList(aliceToken).expect(200);
    expect(response.body).toEqual([
      {
        id: directId,
        kind: 'direct',
        peer: {
          id: bobId,
          name: 'Bob',
          avatar: 'https://example.test/bob.png',
          isDeleted: false,
        },
        latestMessage: {
          id: messageId,
          content: 'Persisted hello',
          createdAt: messageAt.toISOString(),
        },
        lastMessageAt: messageAt.toISOString(),
      },
      {
        id: emptyId,
        kind: 'direct',
        peer: { id: danId, name: 'Dan', avatar: null, isDeleted: false },
        latestMessage: null,
        lastMessageAt: null,
      },
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /phoneNumber|users|messages|hashedRefreshToken|name":null/,
    );
    expect((await getList(carolToken).expect(200)).body).toEqual([]);
    const bobList = (await getList(bobToken).expect(200)).body as Array<{
      id: string;
    }>;
    expect(bobList.map((item) => item.id)).toEqual(
      [directId, otherId].sort((a, b) => b.localeCompare(a)),
    );
  });

  it('returns safe detail without embedded history and leaves history on its endpoint', async () => {
    const detail = await getDetail(aliceToken, directId).expect(200);
    expect(detail.body).toEqual({
      id: directId,
      kind: 'direct',
      peer: {
        id: bobId,
        name: 'Bob',
        avatar: 'https://example.test/bob.png',
        isDeleted: false,
      },
      lastMessageAt: messageAt.toISOString(),
      canMessage: true,
      blockedByMe: false,
    });
    expect((await getDetail(aliceToken, emptyId).expect(200)).body).toEqual({
      id: emptyId,
      kind: 'direct',
      peer: { id: danId, name: 'Dan', avatar: null, isDeleted: false },
      lastMessageAt: null,
      canMessage: true,
      blockedByMe: false,
    });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /phoneNumber|users|messages|hashedRefreshToken/,
    );
    expect((await getDetail(bobToken, directId).expect(200)).body).toEqual({
      id: directId,
      kind: 'direct',
      peer: { id: aliceId, name: 'Alice', avatar: null, isDeleted: false },
      lastMessageAt: messageAt.toISOString(),
      canMessage: true,
      blockedByMe: false,
    });
    const history = await request(app.getHttpServer())
      .get(`/messages/${directId}`)
      .query({ limit: 20 })
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(history.body).toEqual({
      items: [
        expect.objectContaining({
          id: messageId,
          content: 'Persisted hello',
          senderId: bobId,
          conversationId: directId,
          createdAt: messageAt.toISOString(),
        }),
      ],
      nextCursor: null,
    });
  });

  it('does not enumerate inaccessible or nonexistent detail and validates IDs', async () => {
    await request(app.getHttpServer())
      .get(`/conversations/${directId}`)
      .expect(401);
    const inaccessible = await getDetail(carolToken, directId).expect(404);
    const nonexistent = await getDetail(aliceToken, randomUUID()).expect(404);
    const inaccessibleBody = inaccessible.body as { message: string };
    const nonexistentBody = nonexistent.body as { message: string };
    expect(inaccessibleBody.message).toBe(nonexistentBody.message);
    await getDetail(aliceToken, 'not-a-uuid').expect(400);
  });

  it('leaves unsupported self and group rows stored but unavailable as direct chats', async () => {
    await getDetail(aliceToken, selfId).expect(404);
    await getDetail(aliceToken, groupId).expect(404);
    expect(
      await prisma.conversation.count({
        where: { id: { in: [selfId, groupId] } },
      }),
    ).toBe(2);
    expect(
      ((await getList(bobToken).expect(200)).body as Array<{ id: string }>).map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual(expect.arrayContaining([directId, otherId]));
  });

  it('limits direct starts per user while preserving canonical creation and committed first-message replay', async () => {
    const sender = randomUUID();
    const token = new JwtService().sign(
      { sub: sender },
      { secret: process.env.ACCESSTOKEN_SECRET },
    );
    await prisma.user.create({
      data: {
        id: sender,
        firebaseUid: sender,
        name: 'Start limiter',
        phoneNumber: '+14155552706',
      },
    });
    const initial = {
      recipientId: bobId,
      initialMessage: 'One first message',
      clientMessageId: randomUUID(),
    };
    let createdId: string | undefined;
    try {
      const first = await start(token, initial).expect(201);
      createdId = (first.body as StartDirectResult).conversation.id;
      for (let attempt = 1; attempt < RATE_POLICIES.start.limit; attempt++)
        await start(token, { recipientId: bobId }).expect(201);
      const blocked = await start(token, { recipientId: bobId }).expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await start(token, initial).expect(201)).body).toEqual(
        first.body,
      );
      expect(
        await prisma.conversation.count({
          where: { directKey: directKey(sender, bobId) },
        }),
      ).toBe(1);
      await start(bobToken, { recipientId: carolId }).expect(201);
    } finally {
      if (createdId) {
        await prisma.message.deleteMany({
          where: { conversationId: createdId },
        });
        await prisma.conversation.delete({ where: { id: createdId } });
      }
      await prisma.user.delete({ where: { id: sender } });
    }
  });

  it('returns the same canonical pair in either order without an initial message', async () => {
    const first = await start(aliceToken, { recipientId: bobId }).expect(201);
    const reverse = await start(bobToken, { recipientId: aliceId }).expect(201);
    const reverseBody = reverse.body as StartDirectResult;
    expect(first.body).toEqual({
      conversation: {
        id: directId,
        kind: 'direct',
        peer: {
          id: bobId,
          name: 'Bob',
          avatar: 'https://example.test/bob.png',
          isDeleted: false,
        },
        lastMessageAt: messageAt.toISOString(),
        canMessage: true,
        blockedByMe: false,
      },
      message: null,
    });
    expect(reverseBody.conversation.id).toBe(directId);
    expect(
      await prisma.conversation.count({
        where: { directKey: directKey(aliceId, bobId) },
      }),
    ).toBe(1);
  });

  it('settles simultaneous opposite starts on one empty canonical row', async () => {
    const [a, b] = await Promise.all([
      start(aliceToken, { recipientId: carolId }),
      start(carolToken, { recipientId: aliceId }),
    ]);
    const aBody = a.body as StartDirectResult;
    const bBody = b.body as StartDirectResult;
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(aBody.conversation.id).toBe(bBody.conversation.id);
    expect(aBody.message).toBeNull();
    expect(bBody.message).toBeNull();
    expect(
      await prisma.conversation.count({
        where: { directKey: directKey(aliceId, carolId) },
      }),
    ).toBe(1);
  });

  it('replays one initial message and conflicts on changed content or recipient', async () => {
    const clientMessageId = randomUUID();
    const body = {
      recipientId: bobId,
      initialMessage: 'New chat',
      clientMessageId,
    };
    const first = await start(aliceToken, body).expect(201);
    const replay = await start(aliceToken, body).expect(201);
    const firstBody = first.body as StartDirectResult;
    expect(replay.body).toEqual(first.body);
    expect(firstBody.conversation.id).toBe(directId);
    expect(firstBody.message).toMatchObject({
      content: 'New chat',
      senderId: aliceId,
      conversationId: directId,
    });
    expect(typeof firstBody.message?.id).toBe('string');
    expect(Number.isNaN(Date.parse(firstBody.message?.createdAt ?? ''))).toBe(
      false,
    );
    expect(
      await prisma.message.count({
        where: { userId: aliceId, clientMessageId },
      }),
    ).toBe(1);
    await start(aliceToken, {
      ...body,
      initialMessage: 'Different text',
    }).expect(409);
    await start(aliceToken, { ...body, recipientId: danId }).expect(409);

    // The new pair is created before the duplicate message insert fails; its transaction must roll back.
    await start(aliceToken, { ...body, recipientId: erinId }).expect(409);
    expect(
      await prisma.conversation.count({
        where: { directKey: directKey(aliceId, erinId) },
      }),
    ).toBe(0);
    expect(
      await prisma.message.count({
        where: { userId: aliceId, clientMessageId },
      }),
    ).toBe(1);
  });

  it('deduplicates simultaneous retries from the same sender', async () => {
    const clientMessageId = randomUUID();
    const body = {
      recipientId: bobId,
      initialMessage: 'One concurrent logical message',
      clientMessageId,
    };
    const [first, retry] = await Promise.all([
      start(aliceToken, body),
      start(aliceToken, body),
    ]);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(
      await prisma.message.count({
        where: { userId: aliceId, clientMessageId },
      }),
    ).toBe(1);
  });

  it('preserves both authors and first messages in simultaneous opposite starts', async () => {
    const [a, b] = await Promise.all([
      start(bobToken, {
        recipientId: carolId,
        initialMessage: 'From Bob',
        clientMessageId: randomUUID(),
      }),
      start(carolToken, {
        recipientId: bobId,
        initialMessage: 'From Carol',
        clientMessageId: randomUUID(),
      }),
    ]);
    const aBody = a.body as StartDirectResult;
    const bBody = b.body as StartDirectResult;
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(aBody.conversation.id).toBe(bBody.conversation.id);
    const id = aBody.conversation.id;
    expect(
      await prisma.conversation.count({
        where: { directKey: directKey(bobId, carolId) },
      }),
    ).toBe(1);
    expect(
      await prisma.message.findMany({
        where: { conversationId: id },
        select: { userId: true, content: true },
        orderBy: { content: 'asc' },
      }),
    ).toEqual([
      { userId: bobId, content: 'From Bob' },
      { userId: carolId, content: 'From Carol' },
    ]);
    expect(aBody.message?.senderId).toBe(bobId);
    expect(bBody.message?.senderId).toBe(carolId);
  });

  it('validates target, text, and client key without creating unsupported rows', async () => {
    await start(aliceToken, { recipientId: aliceId }).expect(400);
    await start(aliceToken, { recipientId: randomUUID() }).expect(404);
    await start(aliceToken, { recipientId: 'bad-id' }).expect(400);
    await start(aliceToken, {
      recipientId: erinId,
      initialMessage: '  ',
      clientMessageId: randomUUID(),
    }).expect(400);
    await start(aliceToken, {
      recipientId: erinId,
      initialMessage: null,
    }).expect(400);
    await start(aliceToken, {
      recipientId: erinId,
      initialMessage: 'x'.repeat(4001),
      clientMessageId: randomUUID(),
    }).expect(400);
    await start(aliceToken, {
      recipientId: erinId,
      initialMessage: 'Valid',
      clientMessageId: 'bad-id',
    }).expect(400);
    await start(aliceToken, {
      recipientId: erinId,
      initialMessage: 'Valid',
    }).expect(400);
    await start(aliceToken, {
      recipientId: erinId,
      clientMessageId: randomUUID(),
    }).expect(400);
    await start(aliceToken, { recipientId: erinId, userIds: [erinId] }).expect(
      400,
    );
    expect(
      await prisma.conversation.count({
        where: { directKey: directKey(aliceId, erinId) },
      }),
    ).toBe(0);
  });

  it('stores required client message IDs for fixture messages', async () => {
    await prisma.message.createMany({
      data: [
        {
          id: randomUUID(),
          clientMessageId: randomUUID(),
          userId: aliceId,
          conversationId: directId,
          content: 'Legacy one',
        },
        {
          id: randomUUID(),
          clientMessageId: randomUUID(),
          userId: aliceId,
          conversationId: directId,
          content: 'Legacy two',
        },
      ],
    });
    const fixtureMessages = await prisma.message.findMany({
      where: {
        userId: aliceId,
        conversationId: directId,
        content: { startsWith: 'Legacy' },
      },
    });
    expect(fixtureMessages).toHaveLength(2);
    expect(
      fixtureMessages.every((message) => Boolean(message.clientMessageId)),
    ).toBe(true);
  });
});
