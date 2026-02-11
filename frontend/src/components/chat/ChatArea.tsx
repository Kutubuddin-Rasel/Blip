import {
  ChatAreaProps,
  Conversation,
  CreatedConversation,
} from "@/interface/Conversation.interface";
import { ChatService } from "@/services/chat.service";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export default function ChatArea({
  conversation,
  draftUserId,
  userName,
}: ChatAreaProps) {
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: async () => {
      return ChatService.createConversation([draftUserId!], message);
    },
    onSuccess: (newConv: CreatedConversation) => {
      queryClient.setQueryData(["conversations"], (old: Conversation[]) => {
        return [newConv, ...(old || [])];
      });
      setMessage("");
      router.push(`/chat/${newConv.id}`);
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    if (draftUserId) {
      createMutation.mutate();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-4 border-b font-bold">
        {draftUserId
          ? userName
          : conversation?.name || conversation?.users[0].name}
      </div>
      <div className="p-4 border-t flex gap-2">
        <Input
          placeholder="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend}
        />
        <Button onClick={handleSend} disabled={createMutation.isPending}>
            Send
        </Button>
      </div>
    </div>
  );
}
