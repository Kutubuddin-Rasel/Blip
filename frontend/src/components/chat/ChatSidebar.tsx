"use client";

import { ChatSidebarProps } from "@/interface/Conversation.interface";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ChatService } from "@/services/chat.service";
import NewChatDialog from "./NewChatDialog";

export default function ChatSidebar({
  initialConversations,
}: ChatSidebarProps) {
  const pathName = usePathname();
  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => ChatService.getConversations(),
    initialData: initialConversations,
  });
  return (
    <div className="w-80 border-r h-full flex flex-col bg-zinc-50 dark:bg-zinc-900">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="p-4 border-b font-bold text-xl">Chats</div>
        <NewChatDialog />
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-zinc-500 text-center text-sm">
            No conversations yet.
          </div>
        ) : (
          conversations.map((conv) => {
            const otherUser = conv.users[0];
            const latestMessage = conv.messages[0];
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
                  <AvatarImage src={otherUser?.avatar || ""} />
                  <AvatarFallback>
                    <UserIcon className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium truncate">{otherUser.name}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {latestMessage.content}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
