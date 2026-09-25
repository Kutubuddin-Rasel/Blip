export interface AuthUser {
  id: string;
  name: string;
  phoneNumber: string;
  avatar: string | null;
}

export interface JwtPayload {
  sub: string;
  username: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
}

export interface SafeUser extends Tokens {
  user: AuthUser;
}
