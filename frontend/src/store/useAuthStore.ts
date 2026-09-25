import { User } from "@/interface/Auth.interface";
import { create } from "zustand";

export type AuthStatus = "bootstrapping" | "authenticated" | "unauthenticated" | "error";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  beginBootstrap: () => void;
  authenticated: (user: User, token: string) => void;
  unauthenticated: () => void;
  sessionError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "bootstrapping",
  user: null,
  token: null,
  beginBootstrap: () => set({ status: "bootstrapping", user: null, token: null }),
  authenticated: (user, token) => set({ status: "authenticated", user, token }),
  unauthenticated: () => set({ status: "unauthenticated", user: null, token: null }),
  sessionError: () => set({ status: "error", token: null }),
}));
