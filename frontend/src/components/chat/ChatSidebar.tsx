"use client";

import { conversationKeys } from "@/lib/conversation-keys";
import { canUseServer } from "@/lib/session-rules";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { selectVisibleAccountId } from "@/store/useAuthStore";
import { useOnline } from "@/hooks/useOnline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { LogOut, Trash2, UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ChatService } from "@/services/conversation.service";
import NewChatDialog from "./NewChatDialog";
import api from "@/lib/api";
import { endSession } from "@/lib/session";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { isAxiosError } from "axios";

export default function ChatSidebar({ className }: { className?: string }) {
  const pathName = usePathname();
  const router = useRouter();
  const accountId = useAuthStore(selectVisibleAccountId);
  const status = useAuthStore((state) => state.status);
  const token = useAuthStore((state) => state.token);
  const online = useOnline();
  const serverReady = canUseServer(status, online, token);
  const sessionLoading = status === "bootstrapping";
  const [deleting, setDeleting] = useState(false);
  const logout = async () => {
    if (status === "cached") {
      await endSession(true);
      try { await signOut(auth); } catch { /* Local cache and Blip session were cleared. */ }
      router.replace("/auth/login");
      return;
    }
    let failed = false;
    if (serverReady) {
      try { await api.post("auth/logout"); } catch { failed = true; }
    } else if (status === "authenticated") failed = true;
    await endSession(true);
    try { await signOut(auth); } catch { failed = true; }
    router.replace("/auth/login");
    if (failed) toast.error("Signed out here, but server revocation was not confirmed. This session may restore on reload.");
  };
  const deleteAccount = async () => {
    if (!serverReady || deleting || !window.confirm("Delete your Blip account? Your profile and session will be removed. Messages you sent will remain visible to conversation participants. If you register again, your old account and history cannot be restored.")) return;
    setDeleting(true);
    try {
      await api.delete("auth/account");
      await endSession(true);
      try { await signOut(auth); } catch { /* Blip session is already revoked. */ }
      router.replace("/auth/login");
    } catch (error) {
      toast.error(isAxiosError(error) && error.response?.status === 401
        ? "A current session is required. Sign in again before deleting your account."
        : "Could not delete your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };
  const conversationsQuery = useQuery({
    queryKey: conversationKeys.list(accountId),
    queryFn: () => ChatService.getConversations(),
    enabled: serverReady && !!accountId,
    refetchOnMount: "always",
    retry: false,
  });
  return (
    <div className={cn("w-80 border-r h-full flex flex-col bg-zinc-50 dark:bg-zinc-900", className)}>
      <div className="p-4 border-b flex items-center justify-between">
        <div className="font-bold text-xl">Chats</div>
        {serverReady && <NewChatDialog />}
        <button type="button" aria-label={status === "cached" ? "Exit saved chats" : "Log out"} title={status === "cached" ? "Exit saved chats" : "Log out"} onClick={() => void logout()}><LogOut className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversationsQuery.isError && !!conversationsQuery.data && <p role="status" className="px-4 pt-3 text-xs text-amber-700">Showing saved chats. Could not refresh them.</p>}
        {sessionLoading ? (
          <div className="p-4 text-zinc-500 text-sm">Restoring session…</div>
        ) : !accountId || (status !== "cached" && !token) ? (
          <div className="p-4 text-zinc-500 text-sm"><Link href="/auth/login">Sign in to see your chats.</Link></div>
        ) : conversationsQuery.isPending ? (
          <div className="p-4 text-zinc-500 text-sm">{status === "cached" || !online ? "No saved conversation list. Connect to load chats." : "Loading conversations…"}</div>
        ) : conversationsQuery.isError && !conversationsQuery.data ? (
          <div className="p-4 text-zinc-500 text-sm">
            Could not load conversations. <button type="button" className="underline" onClick={() => conversationsQuery.refetch()}>Retry</button>
          </div>
        ) : conversationsQuery.data?.length === 0 ? (
          <div className="p-4 text-zinc-500 text-center text-sm">
            No conversations yet.
          </div>
        ) : (
          (conversationsQuery.data ?? []).map((conv) => {
            const isActive = pathName === `/chat/${conv.id}`;
            return (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className={cn(
                  "flex items-center gap-3 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
                  isActive && "bg-zinc-100 dark:bg-zinc-800",
                )}
              >
                <Avatar>
                  {conv.peer.avatar && <AvatarImage src={conv.peer.avatar} alt="" />}
                  <AvatarFallback>
                    <UserIcon className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium truncate">{conv.peer.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {conv.latestMessage?.content ?? "No messages yet"}
                  </div>
                </div>
                {conv.lastMessageAt && (
                  <time dateTime={conv.lastMessageAt} className="text-xs text-zinc-500 self-start">
                    {new Date(conv.lastMessageAt).toLocaleDateString()}
                  </time>
                )}
              </Link>
            );
          })
        )}
      </div>
      {serverReady && accountId && <div className="p-4 border-t">
        <button type="button" disabled={deleting} onClick={() => void deleteAccount()} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 disabled:opacity-50">
          <Trash2 className="h-4 w-4" />{deleting ? "Deleting account…" : "Delete account"}
        </button>
      </div>}
    </div>
  );
}
