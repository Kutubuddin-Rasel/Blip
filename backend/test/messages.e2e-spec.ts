import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EventsGateway } from '../src/events/events.gateway';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import type { Message, Page } from '../src/interfaces/Message.interface';

describe('Ordinary messages and history (PostgreSQL e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gateway: EventsGateway;
  const [alice, bob, carol] = [randomUUID(), randomUUID(), randomUUID()];
  const [chat, second, concurrentChat, rollbackChat] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('TEST_DATABASE_URL is required');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm4-test-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm4-test-refresh-secret';
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FirebaseService)
      .useValue({})
      .overrideProvider(RedisService)
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
    gateway = app.get(EventsGateway);
    await prisma.user.createMany({
      data: [
        {
          id: alice,
          firebaseUid: alice,
          name: 'M4 Alice',
          phoneNumber: '+14155552901',
        },
        {
          id: bob,
          firebaseUid: bob,
          name: 'M4 Bob',
          phoneNumber: '+14155552902',
        },
        {
          id: carol,
          firebaseUid: carol,
          name: 'M4 Carol',
          phoneNumber: '+14155552903',
        },
      ],
    });
    for (const [id, users] of [
      [chat, [alice, bob]],
      [second, [alice, carol]],
      [concurrentChat, [alice, bob]],
      [rollbackChat, [alice, bob]],
    ] as Array<[string, string[]]>) {
      await prisma.conversation.create({
        data: {
          id,
          users: { connect: users.map((userId) => ({ id: userId })) },
        },
      });
    }
    const jwt = new JwtService();
    const sign = (id: string) =>
      jwt.sign({ sub: id }, { secret: process.env.ACCESSTOKEN_SECRET });
    aliceToken = sign(alice);
    bobToken = sign(bob);
    carolToken = sign(carol);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.message.deleteMany({
        where: { userId: { in: [alice, bob, carol] } },
      });
      await prisma.conversation.deleteMany({
        where: { id: { in: [chat, second, concurrentChat, rollbackChat] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [alice, bob, carol] } },
      });
    }
    await app?.close();
  });

  const send = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/messages')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const history = (
    token: string,
    id: string,
    limit?: number,
    cursor?: string,
  ) => {
    const query: Record<string, string> = {};
    if (limit !== undefined) query.limit = String(limit);
    if (cursor !== undefined) query.cursor = cursor;
    return request(app.getHttpServer())
      .get(`/messages/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .query(query);
  };

  it('commits a mapped message and monotonic activity for a participant', async () => {
    const key = randomUUID();
    const response = await send(aliceToken, {
      conversationId: chat,
      clientMessageId: key,
      content: '  Hello  ',
      userId: bob,
    }).expect(400);
    expect((response.body as { message: string }).message).toBeDefined();
    const accepted = await send(aliceToken, {
      conversationId: chat,
      clientMessageId: key,
      content: '  Hello  ',
    }).expect(201);
    const acceptedMessage = accepted.body as Message;
    expect(acceptedMessage).toEqual({
      id: expect.any(String) as string,
      clientMessageId: key,
      conversationId: chat,
      senderId: alice,
      content: '  Hello  ',
      createdAt: expect.any(String) as string,
    });
    expect(Object.keys(acceptedMessage).sort()).toEqual([
      'clientMessageId',
      'content',
      'conversationId',
      'createdAt',
      'id',
      'senderId',
    ]);
    expect(new Date(acceptedMessage.createdAt).toISOString()).toBe(
      acceptedMessage.createdAt,
    );
    const stored = await prisma.message.findUniqueOrThrow({
      where: { id: acceptedMessage.id },
    });
    const activity = await prisma.conversation.findUniqueOrThrow({
      where: { id: chat },
    });
    expect(stored.userId).toBe(alice);
    expect(stored.clientMessageId).toBe(key);
    expect(activity.lastMessageAt?.toISOString()).toBe(
      stored.createdAt.toISOString(),
    );
  });

  it('hides nonexistent and nonparticipant conversations', async () => {
    const body = { clientMessageId: randomUUID(), content: 'No access' };
    const inaccessible = await send(carolToken, {
      ...body,
      conversationId: chat,
    }).expect(404);
    const absent = await send(carolToken, {
      ...body,
      conversationId: randomUUID(),
    }).expect(404);
    expect((inaccessible.body as { message: string }).message).toBe(
      (absent.body as { message: string }).message,
    );
    expect(
      await prisma.message.count({
        where: { clientMessageId: body.clientMessageId },
      }),
    ).toBe(0);
  });

  it('validates ID, content type, non-whitespace content, and length', async () => {
    const base = {
      conversationId: chat,
      clientMessageId: randomUUID(),
      content: 'valid',
    };
    for (const invalid of [
      { conversationId: 'bad' },
      { clientMessageId: undefined },
      { clientMessageId: 'bad' },
      { clientMessageId: '00000000-0000-1000-8000-000000000000' },
      { content: '' },
      { content: ' \n  ' },
      { content: 5 },
      { content: 'x'.repeat(4001) },
    ]) {
      await send(aliceToken, { ...base, ...invalid }).expect(400);
    }
    await send(aliceToken, {
      ...base,
      clientMessageId: randomUUID(),
      content: 'x'.repeat(4000),
    }).expect(201);
  });

  it('returns one canonical row for exact and simultaneous replay', async () => {
    const key = randomUUID();
    const body = {
      conversationId: chat,
      clientMessageId: key,
      content: 'Same logical send',
    };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => send(aliceToken, body)),
    );
    responses.forEach((response) => expect(response.status).toBe(201));
    responses.forEach((response) =>
      expect(response.body).toEqual(responses[0].body),
    );
    expect((await send(aliceToken, body).expect(201)).body).toEqual(
      responses[0].body,
    );
    expect(
      await prisma.message.count({
        where: { userId: alice, clientMessageId: key },
      }),
    ).toBe(1);
  });

  it('rejects key reuse with changed content or conversation', async () => {
    const key = randomUUID();
    await send(aliceToken, {
      conversationId: chat,
      clientMessageId: key,
      content: 'Original',
    }).expect(201);
    await send(aliceToken, {
      conversationId: chat,
      clientMessageId: key,
      content: 'Changed',
    }).expect(409);
    await send(aliceToken, {
      conversationId: second,
      clientMessageId: key,
      content: 'Original',
    }).expect(409);
    expect(
      await prisma.message.count({
        where: { userId: alice, clientMessageId: key },
      }),
    ).toBe(1);
  });

  it('scopes the idempotency key to the sender', async () => {
    const key = randomUUID();
    const body = {
      conversationId: chat,
      clientMessageId: key,
      content: 'Shared UUID',
    };
    await send(aliceToken, body).expect(201);
    await send(bobToken, body).expect(201);
    expect(
      await prisma.message.count({ where: { clientMessageId: key } }),
    ).toBe(2);
  });

  it('rolls back insertion if required activity persistence fails', async () => {
    const functionName = 'm4_reject_activity';
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${rollbackChat}' THEN RAISE EXCEPTION 'activity failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${functionName} BEFORE UPDATE ON "Conversation" FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    const key = randomUUID();
    try {
      await send(aliceToken, {
        conversationId: rollbackChat,
        clientMessageId: key,
        content: 'Rollback',
      }).expect(500);
      expect(
        await prisma.message.count({ where: { clientMessageId: key } }),
      ).toBe(0);
      expect(
        (
          await prisma.conversation.findUniqueOrThrow({
            where: { id: rollbackChat },
          })
        ).lastMessageAt,
      ).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER ${functionName} ON "Conversation"`,
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`);
    }
  });

  it('keeps activity at the greatest committed message time under concurrent sends', async () => {
    const requests = Array.from({ length: 12 }, (_, index) =>
      send(aliceToken, {
        conversationId: concurrentChat,
        clientMessageId: randomUUID(),
        content: `Concurrent ${index}`,
      }),
    );
    const responses = await Promise.all(requests);
    responses.forEach((response) => expect(response.status).toBe(201));
    const rows = await prisma.message.findMany({
      where: { conversationId: concurrentChat },
    });
    const activity = await prisma.conversation.findUniqueOrThrow({
      where: { id: concurrentChat },
    });
    expect(rows).toHaveLength(12);
    expect(activity.lastMessageAt?.getTime()).toBe(
      Math.max(...rows.map((row) => row.createdAt.getTime())),
    );
  });

  it('contains a socket publisher failure after durable commit', async () => {
    const original = gateway.server;
    const key = randomUUID();
    gateway.server = {
      to: () => {
        throw new Error('publisher unavailable');
      },
    } as unknown as typeof gateway.server;
    try {
      const response = await send(aliceToken, {
        conversationId: chat,
        clientMessageId: key,
        content: 'Durable',
      }).expect(201);
      expect((response.body as Message).clientMessageId).toBe(key);
      expect(
        await prisma.message.count({
          where: { userId: alice, clientMessageId: key },
        }),
      ).toBe(1);
    } finally {
      gateway.server = original;
    }
  });

  it.each([0, 1, 20, 21, 40, 41, 45])(
    'paginates %i tied-timestamp messages exactly once',
    async (size) => {
      const id = randomUUID();
      await prisma.conversation.create({
        data: { id, users: { connect: [{ id: alice }, { id: bob }] } },
      });
      try {
        const at = new Date('2026-09-10T12:00:00.000Z');
        const seed = Array.from({ length: size }, (_, index) => ({
          id: randomUUID(),
          clientMessageId: randomUUID(),
          conversationId: id,
          userId: index % 2 ? bob : alice,
          content: `History ${index}`,
          createdAt: index % 3 ? at : new Date(at.getTime() - 1000),
        }));
        if (seed.length) await prisma.message.createMany({ data: seed });
        const expected = [...seed]
          .sort(
            (a, b) =>
              b.createdAt.getTime() - a.createdAt.getTime() ||
              b.id.localeCompare(a.id),
          )
          .map((row) => row.id);
        const seen: string[] = [];
        const pageSizes: number[] = [];
        let cursor: string | null = null;
        do {
          const response = await history(
            aliceToken,
            id,
            undefined,
            cursor ?? undefined,
          ).expect(200);
          const page = response.body as Page<Message>;
          pageSizes.push(page.items.length);
          expect(page.items.length).toBeLessThanOrEqual(20);
          for (const message of page.items) {
            expect(Object.keys(message).sort()).toEqual([
              'clientMessageId',
              'content',
              'conversationId',
              'createdAt',
              'id',
              'senderId',
            ]);
            seen.push(message.id);
          }
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toEqual(expected);
        expect(new Set(seen).size).toBe(size);
        expect(pageSizes).toEqual(
          size === 0
            ? [0]
            : Array.from({ length: Math.ceil(size / 20) }, (_, index) =>
                Math.min(20, size - index * 20),
              ),
        );
      } finally {
        await prisma.message.deleteMany({ where: { conversationId: id } });
        await prisma.conversation.delete({ where: { id } });
      }
    },
  );

  it('validates limits, cursor structure and scope while keeping authorization independent', async () => {
    for (let index = 0; index < 2; index++) {
      await send(aliceToken, {
        conversationId: chat,
        clientMessageId: randomUUID(),
        content: `Cursor fixture ${index}`,
      }).expect(201);
    }
    for (const limit of ['0', '51', '-1', 'abc', '1.5']) {
      const response = await request(app.getHttpServer())
        .get(`/messages/${chat}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .query({ limit });
      expect([limit, response.status]).toEqual([limit, 400]);
    }
    await history(aliceToken, 'bad').expect(400);
    const first = await history(aliceToken, chat, 1).expect(200);
    expect((first.body as Page<Message>).items).toHaveLength(1);
    const cursor = (first.body as Page<Message>).nextCursor;
    expect(cursor).toEqual(expect.any(String));
    await history(aliceToken, chat, 20, 'bad').expect(400);
    await history(aliceToken, second, 20, cursor!).expect(400);
    await history(carolToken, chat, 20, cursor!).expect(404);
    await history(carolToken, randomUUID()).expect(404);
  });
});
