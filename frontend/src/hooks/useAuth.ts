import { refreshSession } from "@/lib/api";
import { bindSessionCache, endSession, enterCachedMode, listenForSessionEvents, sessionGeneration } from "@/lib/session";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";

export async function bootstrapSession(): Promise<void> {
  const generation = sessionGeneration();
  useAuthStore.getState().beginBootstrap();
  try { await refreshSession(); }
  catch (error) {
    if (sessionGeneration() !== generation) return;
    if (axios.isAxiosError(error) && error.response?.status === 401) await endSession();
    else if (axios.isAxiosError(error) && !error.response) {
      if (await enterCachedMode()) return;
      if (sessionGeneration() === generation) useAuthStore.getState().sessionError();
    } else useAuthStore.getState().sessionError();
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  useEffect(() => {
    bindSessionCache(queryClient);
    const stop = listenForSessionEvents(bootstrapSession);
    const onFocus = () => {
      if (useAuthStore.getState().status === "cached") void bootstrapSession();
    };
    window.addEventListener("online", bootstrapSession);
    window.addEventListener("focus", onFocus);
    void bootstrapSession();
    return () => { stop(); window.removeEventListener("online", bootstrapSession); window.removeEventListener("focus", onFocus); };
  }, [queryClient]);
}
