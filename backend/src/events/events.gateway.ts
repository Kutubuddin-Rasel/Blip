import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from 'src/interfaces/AuthUser.interface';
import { SocketAuth, SocketData } from 'src/interfaces/Socket.interface';
import { PrismaService } from 'src/prisma.service';

@WebSocketGateway({
  cors: {
    origin: process.env.NEXT_PUBLIC_FRONTEND_URL,
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as SocketAuth;
      const token = auth.token || client.handshake.headers.authorization;

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const secret =
        this.configService.getOrThrow<string>('ACCESSTOKEN_SECRET');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      client.data = { user: payload };
      console.log(`User ${payload.sub} is connected`);
    } catch (error) {
      console.log('Auth failed', error);
      client.disconnect();
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(client: Socket, conversationId: string) {
    const userId = (client.data as SocketData).user.sub;
    const isParticipant = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: { some: { id: userId } },
      },
    });
    if (!isParticipant) {
      throw new UnauthorizedException('User tried to join unautohrized room');
    }
    await client.join(conversationId);
  }

  handleDisconnect(client: Socket) {
    console.log(`Clinet disconnected ${client.id}`);
  }
}
