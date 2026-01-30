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

export interface tokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser extends tokens {
  user: AuthUser;
}
