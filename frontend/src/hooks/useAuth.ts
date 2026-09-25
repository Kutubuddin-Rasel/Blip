import { refreshSession } from "@/lib/api";
import { bindSessionCache, endSession, listenForSessionEvents } from "@/lib/session";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";

export async function bootstrapSession(): Promise<void> {
  useAuthStore.getState().beginBootstrap();
  try { await refreshSession(); }
  catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) await endSession();
    else useAuthStore.getState().sessionError();
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  useEffect(() => {
    bindSessionCache(queryClient);
    const stop = listenForSessionEvents(bootstrapSession);
    void bootstrapSession();
    return stop;
  }, [queryClient]);
}
