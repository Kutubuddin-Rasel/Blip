export interface SafeUser {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
  accessToken: string;
  refreshToken: string;
}
