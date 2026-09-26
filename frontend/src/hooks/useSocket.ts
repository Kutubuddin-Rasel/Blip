import { socket } from "@/lib/socket";
import { conversationKeys } from "@/lib/conversation-keys";
import { useOnline } from "./useOnline";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Hint = { conversationId: string; messageId?: string };

export function useSocket() {
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  const token = useAuthStore((state) => state.token);
  const online = useOnline();
  const pathname = usePathname();
  const activeId = /^\/chat\/([0-9a-f-]{36})$/i.exec(pathname)?.[1] ?? null;
  const activeRef = useRef(activeId);
  const syncRef = useRef<(() => Promise<void>) | null>(null);
  const queryClient = useQueryClient();
  activeRef.current = activeId;

  useEffect(() => {
    if (!accountId || !token || !online) {
      socket.disconnect();
      return;
    }

    let ready = false;
    let joined: string | null = null;
    let joinQueue = Promise.resolve();
    let lastInactive = Date.now();
    const current = () => {
      const auth = useAuthStore.getState();
      return auth.user?.id === accountId && auth.token === token;
    };
    const reconcile = (id = activeRef.current) => {
      if (!current()) return;
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list(accountId) });
      if (id) {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(accountId, id) });
        void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(accountId, id) });
      }
    };
    const syncActive = () => {
      joinQueue = joinQueue.then(async () => {
        while (ready && current() && joined !== activeRef.current) {
          if (joined) {
            socket.emit("conversation.leave", joined);
            joined = null;
          }
          const id = activeRef.current;
          if (!id) break;
          try {
            const result = await socket.timeout(5000).emitWithAck("conversation.join", id) as { ok: boolean };
            if (!result.ok || !ready || !current()) break;
            joined = id;
          } catch {
            break;
          }
        }
      }).catch(() => {});
      return joinQueue;
    };
    syncRef.current = syncActive;

    const onReady = () => {
      if (!current()) return;
      ready = true;
      joined = null;
      void syncActive().then(() => reconcile());
    };
    const onDisconnect = () => { ready = false; joined = null; };
    const onConversation = (hint: Hint) => {
      if (!current() || typeof hint?.conversationId !== "string") return;
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list(accountId) });
    };
    const onMessage = (hint: Hint) => {
      if (!current() || typeof hint?.conversationId !== "string" || typeof hint.messageId !== "string") return;
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list(accountId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(accountId, hint.conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(accountId, hint.conversationId) });
    };
    const onVisibility = () => {
      if (document.hidden) { lastInactive = Date.now(); return; }
      if (Date.now() - lastInactive < 30_000 || !current()) return;
      lastInactive = Date.now();
      if (!socket.connected) socket.connect();
      reconcile();
    };
    const onFocus = () => onVisibility();

    socket.on("app.ready", onReady);
    socket.on("disconnect", onDisconnect);
    socket.on("conversation.created", onConversation);
    socket.on("message.created", onMessage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    socket.disconnect();
    socket.auth = { token };
    socket.connect();

    return () => {
      ready = false;
      syncRef.current = null;
      socket.off("app.ready", onReady);
      socket.off("disconnect", onDisconnect);
      socket.off("conversation.created", onConversation);
      socket.off("message.created", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      socket.disconnect();
    };
  }, [accountId, token, online, queryClient]);

  useEffect(() => {
    void syncRef.current?.().then(() => {
      if (!accountId || !activeId) return;
      const auth = useAuthStore.getState();
      if (auth.user?.id !== accountId || auth.token !== token) return;
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(accountId, activeId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(accountId, activeId) });
    });
  }, [activeId, accountId, token, queryClient]);
}
