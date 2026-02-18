"use client";
import {
  ChatAreaProps,
  Conversation,
  CreatedConversation,
  Message,
} from "@/interface/Conversation.interface";
import { ChatService } from "@/services/conversation.service";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import ChatInput from "./ChatInput";
import { MessageService } from "@/services/message.service";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { MessageResponse } from "@/interface/Message.interface";
import ChatList from "./ChatList";
import { socket } from "@/lib/socket";
import { toast } from "sonner";

export default function ChatArea({
  conversation,
  draftUserId,
  userName,
}: ChatAreaProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const conversationId = conversation ? conversation.id : null;

  useEffect(() => {
    if (conversationId && socket) {
      socket.emit("joinConversation", conversationId);
    }
  }, [conversationId, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMessage: Message) => {
      if (newMessage.conversationId != conversationId) return;
      queryClient.setQueryData<InfiniteData<MessageResponse>>(
        ["messages", conversationId],
        (oldData) => {
          if (!oldData) return undefined;
          const alreadyEsixt = oldData.pages[0].items.some(
            (m) => m.id === newMessage.id,
          );
          if (alreadyEsixt) {
            return oldData;
          }
          const newPages = [...oldData.pages];
          newPages[0] = {
            ...newPages[0],
            items: [newMessage, ...newPages[0].items],
          };
          return {
            ...oldData,
            pages: newPages,
          };
        },
      );
    };

    socket.on("newMessage", handleNewMessage);
    return () => {
      socket.off("newMessage", handleNewMessage);
    };
  }, [socket, conversationId, queryClient]);

  const createMutation = useMutation({
    mutationFn: async (text: string) => {
      if (draftUserId) {
        return ChatService.createConversation([draftUserId], text);
      }
      if (conversationId) {
        return MessageService.sendMessage(conversationId, text);
      }
      throw new Error("No conversation context");
    },
    onSuccess: (data) => {
      if (draftUserId) {
        const newConv = data as CreatedConversation;
        queryClient.setQueryData(["conversations"], (old: Conversation[]) => {
          return [newConv, ...(old || [])];
        });
        router.replace(`/chat/${newConv.id}`);
      } else {
        const newMessage = data as Message;
        queryClient.setQueryData<InfiniteData<MessageResponse>>(
          ["messages", conversationId],
          (oldData) => {
            if (!oldData) return undefined;
            const newPages = [...oldData.pages];
            newPages[0] = {
              ...newPages[0],
              items: [newMessage, ...newPages[0].items],
            };
            return {
              ...oldData,
              pages: newPages,
            };
          },
        );
      }
    },
    onError:(error)=>{
      console.log("Message send filed: ",error);
      toast.error("Message failed to send. Please try again.")
    }
  });

  const { data: fetchedConversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => ChatService.getConversation(conversationId!),
    enabled: !!conversationId && !conversation,
    initialData: conversation,
  });

  const activeConversation = conversation || fetchedConversation;

  const {
    data: messageData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    MessageResponse,
    Error,
    InfiniteData<MessageResponse>,
    ["messages", string | null],
    string | undefined
  >({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) =>
      MessageService.getMessages(conversationId!, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastMessage) => lastMessage.nextCursor,
    enabled: !!conversationId,
    initialData: activeConversation
      ? {
          pages: [
            {
              items: activeConversation.messages,
              nextCursor:
                activeConversation.messages.length > 0
                  ? activeConversation.messages[
                      activeConversation.messages.length - 1
                    ].id
                  : null,
            },
          ],
          pageParams: [undefined],
        }
      : undefined,
  });

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage]);

  const handleSend = (text: string) => {
    createMutation.mutate(text);
  };

  const allMessages = messageData?.pages.flatMap((p) => p.items) || [];
  const displayMessages = [...allMessages].reverse();
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-4 border-b font-bold">
        {draftUserId
          ? userName
          : activeConversation?.name || conversation?.users[0].name}
      </div>
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {isFetchingNextPage && (
          <div className="text-center text-xs">Loading History...</div>
        )}
        <div ref={ref} className="h-1">
          <ChatList messages={displayMessages} />
        </div>
      </div>
      <ChatInput onSend={handleSend} disable={createMutation.isPending} />
    </div>
  );
}
