import { QueryClient } from "@tanstack/react-query";
import { RefreshResponse } from "@/interface/Auth.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { installWithIsolation, sessionEventAction } from "./session-rules";
import { socket } from "./socket";
import { OfflineCache, wipeLocalAccount } from "./offline-cache";

let queryClient: QueryClient | null = null;
let offlineCache: OfflineCache | null = null;
let channel: BroadcastChannel | null = null;
let generation = 0;
let cachedAccountId: string | null = null;

export function sessionGeneration(): number { return generation; }

export function bindSessionCache(client: QueryClient): void {
  if (queryClient !== client) offlineCache = new OfflineCache(client);
  queryClient = client;
}

export async function enterCachedMode(): Promise<boolean> {
  const startedAt = generation;
  const userId = await offlineCache?.readOnly();
  if (!userId || generation !== startedAt) return false;
  cachedAccountId = userId;
  useAuthStore.getState().cached(userId);
  return true;
}

export async function clearAccount(): Promise<void> {
  const accountId = useAuthStore.getState().user?.id ?? cachedAccountId;
  generation += 1;
  socket.disconnect();
  socket.auth = {};
  useAuthStore.getState().beginBootstrap();
  await wipeLocalAccount(offlineCache, queryClient, accountId);
  cachedAccountId = null;
}

export async function installSession(session: RefreshResponse, announce = false, expectedGeneration?: number): Promise<void> {
  if (expectedGeneration !== undefined && expectedGeneration !== generation) throw new Error("Session changed while refresh was in progress");
  if (announce) generation += 1;
  const previousId = useAuthStore.getState().user?.id ?? cachedAccountId;
  let commitGeneration = generation;
  await installWithIsolation(cachedAccountId ?? previousId ?? null, session.user.id,
    async () => { commitGeneration = generation + 1; await clearAccount(); },
    async () => {
      await offlineCache?.activate(session.user.id);
      if (generation !== commitGeneration) throw new Error("Session changed during account replacement");
      cachedAccountId = session.user.id;
      useAuthStore.getState().authenticated(session.user, session.accessToken);
    });
  if (announce) announceSession(previousId && previousId !== session.user.id ? "session.changed" : "session.established", session.user.id);
}

export async function endSession(announce = false, notice?: string): Promise<void> {
  const transitionGeneration = generation + 1;
  await clearAccount();
  if (generation !== transitionGeneration) return;
  useAuthStore.getState().unauthenticated(notice);
  if (announce) announceSession("session.ended");
}

function announceSession(type: "session.established" | "session.changed" | "session.ended", userId?: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  channel ??= new BroadcastChannel("blip-session");
  channel.postMessage({ type, userId });
}

export function listenForSessionEvents(rebootstrap: () => Promise<void>): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  channel ??= new BroadcastChannel("blip-session");
  const listener = (event: MessageEvent) => {
    const { type, userId } = event.data ?? {};
    const action = sessionEventAction(type, userId);
    if (action === "end") {
      void clearAccount().then(async () => {
        await rebootstrap();
        if (useAuthStore.getState().status === "unauthenticated") {
          useAuthStore.getState().unauthenticated("Signed out in another tab.");
        }
      });
    } else if (action === "rebootstrap") {
      const currentId = useAuthStore.getState().user?.id ?? useAuthStore.getState().offlineAccountId;
      if (currentId === userId) void rebootstrap();
      else void clearAccount().then(rebootstrap);
    }
  };
  channel.addEventListener("message", listener);
  return () => channel?.removeEventListener("message", listener);
}
