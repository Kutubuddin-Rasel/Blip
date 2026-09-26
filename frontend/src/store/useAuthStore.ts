import type { User } from "@/interface/Auth.interface";
import { create } from "zustand";

export type AuthStatus = "bootstrapping" | "authenticated" | "cached" | "unauthenticated" | "error";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  offlineAccountId: string | null;
  token: string | null;
  notice: string | null;
  beginBootstrap: () => void;
  authenticated: (user: User, token: string) => void;
  cached: (userId: string) => void;
  unauthenticated: (notice?: string) => void;
  sessionError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "bootstrapping",
  user: null,
  offlineAccountId: null,
  token: null,
  notice: null,
  beginBootstrap: () => set({ status: "bootstrapping", user: null, offlineAccountId: null, token: null }),
  authenticated: (user, token) => set({ status: "authenticated", user, offlineAccountId: null, token, notice: null }),
  cached: (userId) => set({ status: "cached", user: null, offlineAccountId: userId, token: null, notice: null }),
  unauthenticated: (notice) => set({ status: "unauthenticated", user: null, offlineAccountId: null, token: null, notice: notice ?? null }),
  sessionError: () => set({ status: "error", user: null, offlineAccountId: null, token: null }),
}));

export const selectVisibleAccountId = (state: AuthState): string | null =>
  state.status === "cached" ? state.offlineAccountId : state.user?.id ?? null;
