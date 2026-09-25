
import ChatSidebar from "@/components/chat/ChatSidebar";

export default function ChatPage() {
  return (
    <>
      <div className="md:hidden flex-1 min-h-0">
        <ChatSidebar className="w-full" />
      </div>
      <div className="hidden md:flex flex-1 items-center justify-center text-zinc-500">
        Select a conversation to start chatting.
      </div>
    </>
  );
}
