"use client";

import ChatArea from "@/components/chat/ChatArea";
import { conversationKeys } from "@/lib/conversation-keys";
import { ChatService } from "@/services/conversation.service";
import { useAuthStore } from "@/store/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  const token = useAuthStore((state) => state.token);
  const sessionLoading = useAuthStore((state) => state.status !== "authenticated");
  const detail = useQuery({
    queryKey: conversationKeys.detail(accountId, id),
    queryFn: () => ChatService.getConversation(id),
    enabled: !sessionLoading && !!accountId && !!token,
    retry: false,
  });

  if (sessionLoading) return <p className="p-6 text-zinc-500">Restoring session…</p>;
  if (!accountId || !token) {
    return <p className="p-6 text-zinc-500">Sign in to view this conversation. <Link href="/auth/login" className="underline">Sign in</Link></p>;
  }
  if (detail.isPending) return <p className="p-6 text-zinc-500">Loading conversation…</p>;
  if (detail.isError) {
    const status = isAxiosError(detail.error) ? detail.error.response?.status : undefined;
    if (status === 404 || status === 400) {
      return <p className="p-6 text-zinc-500">Conversation unavailable. <Link href="/chat" className="underline">Back to chats</Link></p>;
    }
    if (status === 401) {
      return <p className="p-6 text-zinc-500">Your session has expired. <Link href="/auth/login" className="underline">Sign in again</Link></p>;
    }
    return <p className="p-6 text-zinc-500">Could not load this conversation. <button type="button" className="underline" onClick={() => detail.refetch()}>Retry</button></p>;
  }
  return <ChatArea mode="existing" conversation={detail.data} />;
}
