import { JwtPayload } from './AuthUser.interface';

export interface SocketAuth {
  token: string;
}

export interface SocketData {
  user: JwtPayload;
}
