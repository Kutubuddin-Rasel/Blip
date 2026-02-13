'use client';
import {
  ChatAreaProps,
  Conversation,
  CreatedConversation,
} from "@/interface/Conversation.interface";
import { ChatService } from "@/services/chat.service";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import ChatInput from "./ChatInput";

export default function ChatArea({
  conversation,
  draftUserId,
  userName,
}: ChatAreaProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async (text:string) => {
      return ChatService.createConversation([draftUserId!], text);
    },
    onSuccess: (newConv: CreatedConversation) => {
      queryClient.setQueryData(["conversations"], (old: Conversation[]) => {
        return [newConv, ...(old || [])];
      });
      router.push(`/chat/${newConv.id}`);
    },
  });

  const handleSend = (text:string) => {
    if (draftUserId) {
      createMutation.mutate(text);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-4 border-b font-bold">
        {draftUserId
          ? userName
          : conversation?.name || conversation?.users[0].name}
      </div>
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {/* MessageList */}
      </div>
      <ChatInput onSend={handleSend}  disable={createMutation.isPending}/>
    </div>
  );
}
