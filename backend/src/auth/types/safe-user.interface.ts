export interface tokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser extends tokens {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
