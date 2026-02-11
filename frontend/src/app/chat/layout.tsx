import ChatSidebar from "@/components/chat/ChatSidebar";
import { Conversation } from "@/interface/Conversation.interface";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
    const conversations: Array<Conversation> = [];

    return (
        <div className="flex h-screen overflow-hidden">
            <div className="hidden md:flex">
                <ChatSidebar initialConversations={conversations} />
            </div>
            <main className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
                {children}
            </main>
        </div>
    );
}