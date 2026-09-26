"use client";

import ChatArea from "@/components/chat/ChatArea";
import { conversationKeys } from "@/lib/conversation-keys";
import { canUseServer } from "@/lib/session-rules";
import { useOnline } from "@/hooks/useOnline";
import { ChatService } from "@/services/conversation.service";
import { selectVisibleAccountId, useAuthStore } from "@/store/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = useAuthStore(selectVisibleAccountId);
  const status = useAuthStore((state) => state.status);
  const token = useAuthStore((state) => state.token);
  const online = useOnline();
  const sessionLoading = status === "bootstrapping";
  const detail = useQuery({
    queryKey: conversationKeys.detail(accountId, id),
    queryFn: () => ChatService.getConversation(id),
    enabled: canUseServer(status, online, token) && !!accountId,
    refetchOnMount: "always",
    retry: false,
  });

  if (sessionLoading) return <p className="p-6 text-zinc-500">Restoring session…</p>;
  if (!accountId || (status !== "cached" && !token)) {
    return <p className="p-6 text-zinc-500">Sign in to view this conversation. <Link href="/auth/login" className="underline">Sign in</Link></p>;
  }
  if (detail.isPending) return <p className="p-6 text-zinc-500">{status === "cached" || !online ? "This conversation was not saved. Connect to load it." : "Loading conversation…"}</p>;
  if (detail.isError) {
    const status = isAxiosError(detail.error) ? detail.error.response?.status : undefined;
    if (status === 404 || status === 400) {
      return <p className="p-6 text-zinc-500">Conversation unavailable. <Link href="/chat" className="underline">Back to chats</Link></p>;
    }
    if (status === 401) {
      return <p className="p-6 text-zinc-500">Your session has expired. <Link href="/auth/login" className="underline">Sign in again</Link></p>;
    }
    if (!detail.data) return <p className="p-6 text-zinc-500">Could not load this conversation. <button type="button" className="underline" onClick={() => detail.refetch()}>Retry</button></p>;
  }
  if (!detail.data) return <p className="p-6 text-zinc-500">Conversation unavailable. <Link href="/chat" className="underline">Back to chats</Link></p>;
  return <>
    {detail.isError && <p role="status" className="px-4 py-2 text-xs text-amber-700">Showing saved conversation details. Could not refresh them.</p>}
    <ChatArea mode="existing" conversation={detail.data} />
  </>;
}
