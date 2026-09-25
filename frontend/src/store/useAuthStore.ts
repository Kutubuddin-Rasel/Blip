import { User } from "@/interface/Auth.interface";
import { create } from "zustand";

export type AuthStatus = "bootstrapping" | "authenticated" | "unauthenticated" | "error";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  notice: string | null;
  beginBootstrap: () => void;
  authenticated: (user: User, token: string) => void;
  unauthenticated: (notice?: string) => void;
  sessionError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "bootstrapping",
  user: null,
  token: null,
  notice: null,
  beginBootstrap: () => set({ status: "bootstrapping", user: null, token: null }),
  authenticated: (user, token) => set({ status: "authenticated", user, token, notice: null }),
  unauthenticated: (notice) => set({ status: "unauthenticated", user: null, token: null, notice: notice ?? null }),
  sessionError: () => set({ status: "error", token: null }),
}));
