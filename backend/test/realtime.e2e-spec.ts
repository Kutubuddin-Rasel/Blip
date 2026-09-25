import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EventsGateway } from '../src/events/events.gateway';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import type { Message, Page } from '../src/interfaces/Message.interface';

type Hint = { conversationId: string; messageId?: string };

describe('Authenticated realtime hints (PostgreSQL and Socket.IO e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gateway: EventsGateway;
  let url: string;
  const jwt = new JwtService();
  const [alice, bob, carol] = [randomUUID(), randomUUID(), randomUUID()];
  const chat = randomUUID();
  const sockets: Socket[] = [];
  const sign = (id: string, expiresIn: number | string = '15m') =>
    jwt.sign(
      { sub: id },
      { secret: 'm5-test-access-secret', expiresIn: expiresIn as number },
    );
  const aliceToken = sign(alice);
  const bobToken = sign(bob);
  const carolToken = sign(carol);

  const client = (token?: string) => {
    const socket = io(url, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      auth: token ? { token } : {},
    });
    sockets.push(socket);
    return socket;
  };
  const event = <T>(socket: Socket, name: string, timeout = 3000): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(name, listener);
        reject(new Error(`Timed out waiting for ${name}`));
      }, timeout);
      const listener = (value: T) => {
        clearTimeout(timer);
        resolve(value);
      };
      socket.once(name, listener);
    });
  const ready = async (token: string) => {
    const socket = client(token);
    const connected = event<void>(socket, 'app.ready');
    socket.connect();
    await connected;
    return socket;
  };
  const join = (socket: Socket, id: string) =>
    socket.timeout(3000).emitWithAck('conversation.join', id) as Promise<{
      ok: boolean;
    }>;
  const send = (token: string, id: string, content: string) =>
    request(app.getHttpServer())
      .post('/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId: id, content, clientMessageId: randomUUID() });

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('TEST_DATABASE_URL is required');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ACCESSTOKEN_SECRET = 'm5-test-access-secret';
    process.env.REFRESHTOKEN_SECRET = 'm5-test-refresh-secret';
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
    await app.listen(0, '127.0.0.1');
    const httpServer = app.getHttpServer() as { address(): AddressInfo };
    url = `http://127.0.0.1:${httpServer.address().port}`;
    prisma = app.get(PrismaService);
    gateway = app.get(EventsGateway);
    await prisma.user.createMany({
      data: [
        {
          id: alice,
          firebaseUid: alice,
          name: 'Realtime Alice',
          phoneNumber: '+14155553001',
        },
        {
          id: bob,
          firebaseUid: bob,
          name: 'Realtime Bob',
          phoneNumber: '+14155553002',
        },
        {
          id: carol,
          firebaseUid: carol,
          name: 'Realtime Carol',
          phoneNumber: '+14155553003',
        },
      ],
    });
    await prisma.conversation.create({
      data: { id: chat, users: { connect: [{ id: alice }, { id: bob }] } },
    });
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    if (prisma) {
      await prisma.message.deleteMany({
        where: { userId: { in: [alice, bob, carol] } },
      });
      await prisma.conversation.deleteMany({
        where: { users: { some: { id: { in: [alice, bob, carol] } } } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [alice, bob, carol] } },
      });
    }
    await app?.close();
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'bad-token'],
    ['expired', sign(alice, -1)],
    ['deleted user', sign(randomUUID())],
  ])(
    'rejects %s credentials before application readiness',
    async (_, token) => {
      const socket = client(token);
      const rejection = event<Error>(socket, 'connect_error');
      socket.connect();
      expect((await rejection).message).toBe('Unauthorized');
      expect(socket.connected).toBe(false);
    },
  );

  it('signals ready only after joining the server-controlled user room', async () => {
    const socket = await ready(aliceToken);
    expect(
      gateway.server.sockets.adapter.rooms
        .get(`user:${alice}`)
        ?.has(socket.id!),
    ).toBe(true);
    expect(
      gateway.server.sockets.adapter.rooms.get(`user:${bob}`)?.has(socket.id!),
    ).toBeFalsy();
    socket.disconnect();
  });

  it('authorizes active joins, rejects malformed/private joins, and leaves the active room', async () => {
    const participant = await ready(bobToken);
    const outsider = await ready(carolToken);
    expect(await join(participant, chat)).toEqual({ ok: true });
    expect(await join(outsider, chat)).toEqual({ ok: false });
    expect(await join(outsider, 'bad')).toEqual({ ok: false });
    expect(
      gateway.server.sockets.adapter.rooms
        .get(`conversation:${chat}`)
        ?.has(outsider.id!),
    ).toBeFalsy();
    expect(
      await outsider.timeout(3000).emitWithAck('conversation.leave', chat),
    ).toEqual({ ok: false });
    expect(
      await participant.timeout(3000).emitWithAck('conversation.leave', chat),
    ).toEqual({ ok: true });
    expect(
      gateway.server.sockets.adapter.rooms
        .get(`conversation:${chat}`)
        ?.has(participant.id!),
    ).toBeFalsy();
    participant.disconnect();
    outsider.disconnect();
  });

  it('sends one committed message hint through overlapping user/conversation rooms, never to C', async () => {
    const sender = await ready(aliceToken);
    const recipient = await ready(bobToken);
    const outsider = await ready(carolToken);
    expect(await join(sender, chat)).toEqual({ ok: true });
    expect(await join(recipient, chat)).toEqual({ ok: true });
    let senderCount = 0;
    sender.on('message.created', () => senderCount++);
    let count = 0;
    recipient.on('message.created', () => count++);
    let outsiderCount = 0;
    outsider.on('message.created', () => outsiderCount++);
    const senderHint = event<Hint>(sender, 'message.created');
    const hintPromise = event<Hint>(recipient, 'message.created');
    const body = {
      conversationId: chat,
      clientMessageId: randomUUID(),
      content: 'Live hint',
    };
    const response = await request(app.getHttpServer())
      .post('/messages')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send(body)
      .expect(201);
    const message = response.body as Message;
    expect(await senderHint).toEqual({
      conversationId: chat,
      messageId: message.id,
    });
    expect(await hintPromise).toEqual({
      conversationId: chat,
      messageId: message.id,
    });
    expect(
      (
        await request(app.getHttpServer())
          .post('/messages')
          .set('Authorization', `Bearer ${aliceToken}`)
          .send(body)
          .expect(201)
      ).body,
    ).toEqual(message);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(senderCount).toBe(1);
    expect(count).toBe(1);
    expect(outsiderCount).toBe(0);
    expect(await prisma.message.count({ where: { id: message.id } })).toBe(1);
    sender.disconnect();
    recipient.disconnect();
    outsider.disconnect();
  });

  it('recovers a message missed during disconnection from HTTP after reauthentication and rejoin', async () => {
    const first = await ready(bobToken);
    expect(await join(first, chat)).toEqual({ ok: true });
    first.disconnect();
    const response = await send(
      aliceToken,
      chat,
      'Missed while offline',
    ).expect(201);
    const committed = response.body as Message;
    expect(await prisma.message.count({ where: { id: committed.id } })).toBe(1);
    const again = await ready(bobToken);
    expect(
      gateway.server.sockets.adapter.rooms.get(`user:${bob}`)?.has(again.id!),
    ).toBe(true);
    expect(await join(again, chat)).toEqual({ ok: true });
    const history = await request(app.getHttpServer())
      .get(`/messages/${chat}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect(
      (history.body as Page<Message>).items.some(
        (message) => message.id === committed.id,
      ),
    ).toBe(true);
    again.disconnect();
  });

  it('notifies a recipient before any conversation join, then HTTP lists the canonical chat', async () => {
    const recipient = await ready(carolToken);
    const hintPromise = event<Hint>(recipient, 'conversation.created');
    const response = await request(app.getHttpServer())
      .post('/conversations/create')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        recipientId: carol,
        initialMessage: 'First hello',
        clientMessageId: randomUUID(),
      })
      .expect(201);
    const id = (response.body as { conversation: { id: string } }).conversation
      .id;
    expect(await hintPromise).toEqual({ conversationId: id });
    const list = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(200);
    expect(
      (list.body as Array<{ id: string }>).some(
        (conversation) => conversation.id === id,
      ),
    ).toBe(true);
    recipient.disconnect();
  });

  it('replaces the active conversation room on a new authorized join', async () => {
    const response = await request(app.getHttpServer())
      .post('/conversations/create')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ recipientId: carol })
      .expect(201);
    const otherId = (response.body as { conversation: { id: string } })
      .conversation.id;
    const socket = await ready(aliceToken);
    expect(await join(socket, chat)).toEqual({ ok: true });
    expect(await join(socket, otherId)).toEqual({ ok: true });
    expect(
      gateway.server.sockets.adapter.rooms
        .get(`conversation:${chat}`)
        ?.has(socket.id!),
    ).toBeFalsy();
    expect(
      gateway.server.sockets.adapter.rooms
        .get(`conversation:${otherId}`)
        ?.has(socket.id!),
    ).toBe(true);
    socket.disconnect();
  });

  it('keeps a newly committed conversation and first message when socket publishing fails', async () => {
    const original = gateway.server;
    gateway.server = {
      to: () => {
        throw new Error('publisher unavailable');
      },
    } as unknown as typeof gateway.server;
    try {
      const response = await request(app.getHttpServer())
        .post('/conversations/create')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          recipientId: carol,
          initialMessage: 'Committed despite publish failure',
          clientMessageId: randomUUID(),
        })
        .expect(201);
      const body = response.body as {
        conversation: { id: string };
        message: Message;
      };
      expect(
        await prisma.conversation.count({
          where: { id: body.conversation.id },
        }),
      ).toBe(1);
      expect(
        await prisma.message.count({ where: { id: body.message.id } }),
      ).toBe(1);
    } finally {
      gateway.server = original;
    }
  });

  it('disconnects at access-token expiry and can become ready again with a new token', async () => {
    const shortToken = sign(alice, 3);
    const short = await ready(shortToken);
    expect(await join(short, chat)).toEqual({ ok: true });
    const disconnected = event<void>(short, 'disconnect', 4500);
    await disconnected;
    expect(short.connected).toBe(false);
    const replacement = await ready(sign(alice));
    expect(await join(replacement, chat)).toEqual({ ok: true });
    replacement.disconnect();
  });
});
