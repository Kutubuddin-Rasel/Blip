export interface RefreshResponse {
  accessToken: string;
}

export interface LoginResponse {
  user: {
    id: string;
    name: string;
    phoneNumber: string;
    avatar: string | null;
  };
  accessToken: string;
}
