export interface JwtPayload {
  sub: string;
  username: string;
}

export interface VerifiedUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  createdAt: Date;
}
