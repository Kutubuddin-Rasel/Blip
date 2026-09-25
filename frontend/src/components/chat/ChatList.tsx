"use client";
import { Message } from "@/interface/Message.interface";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

export default function ChatList({ messages }: { messages: Message[] }) {
  const { user } = useAuthStore();

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 font-light italic">
        No Message yet.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg) => {
        const isMe = msg.senderId === user?.id;
        return (
          <div
            key={msg.id}
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm [overflow-wrap:anywhere]",
              isMe
                ? "bg-blue-600 text-white self-end rounded-br-none"
                : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 self-start rounded-bl-none border border-zinc-200 dark:border-zinc-700",
            )}
          >
            {msg.content}
            <div
              className={cn(
                "text-[10px] mt-1 text-right opacity-70",
                isMe ? "text-blue-100" : "text-zinc-400",
              )}
            >
              {new Date(msg.createdAt).toLocaleDateString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
