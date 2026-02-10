import { AxiosResponse } from "axios";
import { User } from "firebase/auth";

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

export interface AuthSuccessResult {
  response: AxiosResponse<LoginResponse>;
  firebaseUser: User;
}
