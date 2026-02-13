import { AxiosResponse } from "axios";

export interface User {
  id: string;
  name: string;
  phoneNumber: string;
  avatar: string | null;
}

export interface RefreshResponse {
  user: User;
  accessToken: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface AuthSuccessResult {
  response: AxiosResponse<LoginResponse>;
}
