"use client";

import { ChatAreaProps } from "@/interface/Conversation.interface";
import { MessageResponse } from "@/interface/Message.interface";
import { conversationKeys } from "@/lib/conversation-keys";
import { ChatService } from "@/services/conversation.service";
import { MessageService } from "@/services/message.service";
import { useAuthStore } from "@/store/useAuthStore";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { isAxiosError } from "axios";
import { useLayoutEffect } from "react";
import ChatInput from "./ChatInput";
import ChatList from "./ChatList";

export default function ChatArea(props: ChatAreaProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  const token = useAuthStore((state) => state.token);
  const conversationId = props.mode === "existing" ? props.conversation.id : null;
  const draftUserId = props.mode === "draft" ? props.draftUserId : null;
  const pendingDraft = useRef<{ recipientId: string; text: string; clientMessageId: string } | null>(null);
  const pendingSend = useRef<{ conversationId: string; text: string; clientMessageId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnchor = useRef<{ height: number; top: number; pageCount: number } | null>(null);
  const initialScrolledFor = useRef<string | null>(null);

  const createConversation = useMutation({
    mutationFn: ({ text, clientMessageId }: { text: string; clientMessageId: string }) => {
      if (!draftUserId) throw new Error("No recipient selected");
      return ChatService.createConversation({ recipientId: draftUserId, initialMessage: text, clientMessageId });
    },
    onSuccess: (created) => {
      pendingDraft.current = null;
      if (accountId) void queryClient.invalidateQueries({ queryKey: conversationKeys.list(accountId) });
      router.replace(`/chat/${created.conversation.id}`);
    },
  });

  const sendMessage = useMutation({
    mutationFn: ({ conversationId, text, clientMessageId }: { conversationId: string; text: string; clientMessageId: string }) => {
      return MessageService.sendMessage(conversationId, text, clientMessageId);
    },
    onSuccess: (message) => {
      pendingSend.current = null;
      if (!accountId) return;
      queryClient.setQueryData<InfiniteData<MessageResponse>>(
        conversationKeys.messages(accountId, message.conversationId),
        (oldData) => {
          if (!oldData?.pages[0] || oldData.pages.some((page) => page.items.some((item) => item.id === message.id))) {
            return oldData;
          }
          const pages = [...oldData.pages];
          pages[0] = { ...pages[0], items: [message, ...pages[0].items] };
          return { ...oldData, pages };
        },
      );
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(accountId, message.conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list(accountId) });
    },
  });

  const history = useInfiniteQuery<
    MessageResponse,
    Error,
    InfiniteData<MessageResponse>,
    ReturnType<typeof conversationKeys.messages>,
    string | undefined
  >({
    queryKey: conversationKeys.messages(accountId, conversationId),
    queryFn: ({ pageParam }) => {
      if (!conversationId) throw new Error("No conversation selected");
      return MessageService.getMessages(conversationId, pageParam);
    },
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor,
    enabled: !!accountId && !!token && !!conversationId,
    retry: false,
  });

  const { ref, inView } = useInView();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !history.isFetchNextPageError) {
      const element = scrollRef.current;
      if (element) scrollAnchor.current = {
        height: element.scrollHeight,
        top: element.scrollTop,
        pageCount: history.data?.pages.length ?? 0,
      };
      void fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, history.data?.pages.length, history.isFetchNextPageError]);

  const seen = new Set<string>();
  const messages = (history.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((message) => !seen.has(message.id) && seen.add(message.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !conversationId || !history.data) return;
    if (initialScrolledFor.current !== conversationId) {
      scrollAnchor.current = null;
      element.scrollTop = element.scrollHeight;
      initialScrolledFor.current = conversationId;
    } else if (scrollAnchor.current && history.data.pages.length > scrollAnchor.current.pageCount) {
      const { height, top } = scrollAnchor.current;
      element.scrollTop = top + element.scrollHeight - height;
      scrollAnchor.current = null;
    }
  }, [conversationId, history.data, messages.length]);

  const sendError = sendMessage.isError ? sendMessage.error : createConversation.isError ? createConversation.error : null;
  const sendFailure = sendError ? (() => {
    const status = isAxiosError(sendError) ? sendError.response?.status : undefined;
    const retryable = status === undefined || status >= 500 || status === 408 || status === 429;
    return { retryable, message: status === 429
      ? "Too many sends. Wait a minute, then retry this draft."
      : isAxiosError(sendError) && !sendError.response
      ? "Network unavailable. Retry this draft to confirm whether it sent."
      : retryable
      ? "Server unavailable. Retry this draft to confirm whether it sent."
      : status === 409 ? "Message ID conflict. Edit the text to start a new send."
      : status === 401 ? "Session expired. Sign in again before sending."
      : status === 404 ? "Conversation is unavailable."
      : "Message was not sent. Edit the text and try again." };
  })() : null;
  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      <div className="p-4 border-b font-bold flex items-center gap-3 min-w-0">
        <Link href="/chat" className="md:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></Link>
        <span className="truncate">{props.mode === "draft" ? props.userName : props.conversation.peer.name}</span>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-4">
        <div ref={ref} className="h-1 shrink-0" />
        {conversationId && history.isPending && <p className="text-sm text-zinc-500">Loading messages…</p>}
        {history.isError && !history.isFetchNextPageError && (
          <p className="text-sm text-zinc-500">
            Could not load messages. <button type="button" className="underline" onClick={() => history.refetch()}>Retry</button>
          </p>
        )}
        {history.isFetchNextPageError && (
          <p className="text-sm text-zinc-500">Could not load older messages. <button type="button" className="underline" onClick={() => void history.fetchNextPage()}>Retry</button></p>
        )}
        {history.isFetchingNextPage && <div className="text-center text-xs">Loading History...</div>}
        {(!conversationId || history.isSuccess || (history.isFetchNextPageError && !!history.data)) && <ChatList messages={messages} />}
      </div>
      <ChatInput
        onSend={(text) => {
          if (draftUserId) {
            if (pendingDraft.current?.recipientId !== draftUserId || pendingDraft.current.text !== text) {
              pendingDraft.current = { recipientId: draftUserId, text, clientMessageId: crypto.randomUUID() };
            }
            return createConversation.mutateAsync({ text, clientMessageId: pendingDraft.current.clientMessageId });
          }
          if (conversationId) {
            if (pendingSend.current?.conversationId !== conversationId || pendingSend.current.text !== text) {
              pendingSend.current = { conversationId, text, clientMessageId: crypto.randomUUID() };
            }
            return sendMessage.mutateAsync(pendingSend.current);
          }
        }}
        onEdit={() => { pendingDraft.current = null; pendingSend.current = null; createConversation.reset(); sendMessage.reset(); }}
        disable={!accountId || !token || createConversation.isPending || sendMessage.isPending}
        clearOnSuccess
        failure={sendFailure}
      />
    </div>
  );
}
