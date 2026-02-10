import ChatSidebar from "@/components/chat/ChatSidebar";
import { Conversation } from "@/interface/Conversation.interface";
import { ChatService } from "@/services/chat.service";
import { cookies } from "next/headers";

export default async function ChatLayout({children}:{children:React.ReactNode}) {
    const cookieStore = await cookies();
    const cookieString = cookieStore.toString();

    let conversations:Array<Conversation> =[];
    try {
        conversations = await ChatService.getConversations(({headers:{Cookie:cookieString}}))
    } catch (error) {
        console.error('Failed to fetch chats',error);
    }

    return (
        <div className="flex h-screen overflow-hidden">
            <div className="hidden md:flex">
                <ChatSidebar conversations={conversations} />
            </div>
            <main className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
                {children}
            </main>
        </div>
    );
}