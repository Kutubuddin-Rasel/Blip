import { QueryClient } from "@tanstack/react-query";
import { RefreshResponse } from "@/interface/Auth.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { installWithIsolation, sessionEventAction } from "./session-rules";

let queryClient: QueryClient | null = null;
let channel: BroadcastChannel | null = null;
let generation = 0;
let cachedAccountId: string | null = null;

export function sessionGeneration(): number { return generation; }

export function bindSessionCache(client: QueryClient): void { queryClient = client; }

export async function clearAccount(): Promise<void> {
  generation += 1;
  useAuthStore.getState().beginBootstrap();
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
  }
  cachedAccountId = null;
}

export async function installSession(session: RefreshResponse, announce = false, expectedGeneration?: number): Promise<void> {
  if (expectedGeneration !== undefined && expectedGeneration !== generation) throw new Error("Session changed while refresh was in progress");
  if (announce) generation += 1;
  const previousId = useAuthStore.getState().user?.id;
  let commitGeneration = generation;
  await installWithIsolation(cachedAccountId ?? previousId ?? null, session.user.id,
    async () => { commitGeneration = generation + 1; await clearAccount(); },
    () => {
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
      void clearAccount().then(rebootstrap);
    }
  };
  channel.addEventListener("message", listener);
  return () => channel?.removeEventListener("message", listener);
}
