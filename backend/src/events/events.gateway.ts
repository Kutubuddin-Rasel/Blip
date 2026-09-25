import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma.service';
import { isCanonicalDirect } from 'src/conversations/direct-key';

type AuthenticatedSocket = {
  userId: string;
  expiresAt: number;
  activeConversationId?: string;
  expiryTimer?: ReturnType<typeof setTimeout>;
};

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const conversationRoom = (id: string) => `conversation:${id}`;
const userRoom = (id: string) => `user:${id}`;

@WebSocketGateway({
  cors: {
    origin: process.env.NEXT_PUBLIC_FRONTEND_URL,
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    server.use((client, next) => {
      void (async () => {
        try {
          const token: unknown = (client.handshake.auth as { token?: unknown })
            .token;
          if (typeof token !== 'string' || !token)
            throw new Error('Missing token');
          const payload = await this.jwtService.verifyAsync<{
            sub: string;
            exp: number;
          }>(token, {
            secret: this.configService.getOrThrow<string>('ACCESSTOKEN_SECRET'),
          });
          if (
            !uuidV4.test(payload.sub) ||
            !Number.isSafeInteger(payload.exp) ||
            payload.exp * 1000 <= Date.now()
          ) {
            throw new Error('Invalid claims');
          }
          const user = await this.prisma.user.findUnique({
            where: { id: payload.sub, deletedAt: null },
            select: { id: true },
          });
          if (!user) throw new Error('Unknown user');
          client.data = {
            userId: user.id,
            expiresAt: payload.exp * 1000,
          } satisfies AuthenticatedSocket;
          next();
        } catch {
          next(new Error('Unauthorized'));
        }
      })();
    });
  }

  async handleConnection(client: Socket) {
    const data = client.data as AuthenticatedSocket;
    const remaining = data.expiresAt - Date.now();
    if (remaining <= 0) return client.disconnect(true);
    data.expiryTimer = setTimeout(
      () => client.disconnect(true),
      Math.min(remaining, 2_147_483_647),
    );
    await client.join(userRoom(data.userId));
    const active = await this.prisma.user.findUnique({
      where: { id: data.userId, deletedAt: null },
      select: { id: true },
    });
    if (!active || !client.connected || Date.now() >= data.expiresAt)
      return client.disconnect(true);
    client.emit('app.ready');
  }

  handleDisconnect(client: Socket) {
    const data = client.data as Partial<AuthenticatedSocket>;
    if (data.expiryTimer) clearTimeout(data.expiryTimer);
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(
    client: Socket,
    conversationId: unknown,
  ): Promise<{ ok: boolean }> {
    const data = client.data as AuthenticatedSocket;
    if (Date.now() >= data.expiresAt) {
      client.disconnect(true);
      return { ok: false };
    }
    if (typeof conversationId !== 'string' || !uuidV4.test(conversationId))
      return { ok: false };
    const active = await this.prisma.user.findUnique({
      where: { id: data.userId, deletedAt: null },
      select: { id: true },
    });
    if (!active) {
      client.disconnect(true);
      return { ok: false };
    }
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { directKey: true, users: { select: { id: true } } },
    });
    if (
      !conversation ||
      !isCanonicalDirect(
        conversation.directKey,
        conversation.users,
        data.userId,
      )
    )
      return { ok: false };
    if (
      data.activeConversationId &&
      data.activeConversationId !== conversationId
    ) {
      await client.leave(conversationRoom(data.activeConversationId));
    }
    await client.join(conversationRoom(conversationId));
    data.activeConversationId = conversationId;
    return { ok: true };
  }

  @SubscribeMessage('conversation.leave')
  async leaveConversation(
    client: Socket,
    conversationId: unknown,
  ): Promise<{ ok: boolean }> {
    const data = client.data as AuthenticatedSocket;
    if (conversationId !== data.activeConversationId) return { ok: false };
    if (typeof conversationId !== 'string') return { ok: false };
    await client.leave(conversationRoom(conversationId));
    data.activeConversationId = undefined;
    return { ok: true };
  }

  publishConversationCreated(conversationId: string, userIds: string[]) {
    this.server
      .to(userIds.map(userRoom))
      .emit('conversation.created', { conversationId });
  }

  disconnectUser(userId: string) {
    this.server.in(userRoom(userId)).disconnectSockets(true);
  }

  async publishMessageCreated(conversationId: string, messageId: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { users: { select: { id: true } } },
    });
    const rooms = [
      conversationRoom(conversationId),
      ...conversation.users.map((user) => userRoom(user.id)),
    ];
    this.server
      .to(rooms)
      .emit('message.created', { conversationId, messageId });
  }
}
