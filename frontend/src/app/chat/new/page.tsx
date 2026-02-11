"use client";

import ChatArea from "@/components/chat/ChatArea";
import { useSearchParams } from "next/navigation";

export default function NewChatPage() {
    const searchParams = useSearchParams();
    const userId = searchParams.get('userId');
    const userName = searchParams.get('userName')
    
    if(!(userId || userName)){
        return (<div>Inavlid User</div>);
    }

    return (
        <ChatArea draftUserId={userId} userName={userName} />
    )
}
