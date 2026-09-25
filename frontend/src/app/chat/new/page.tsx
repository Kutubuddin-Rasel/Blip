"use client";

import ChatArea from "@/components/chat/ChatArea";
import { UserDiscoveryResult } from "@/interface/Conversation.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function NewChatPageContent() {
    const searchParams = useSearchParams();
    const userId = searchParams.get('userId');
    const accountId = useAuthStore((state) => state.user?.id);
    const queryClient = useQueryClient();
    const recipient = accountId
        ? queryClient.getQueryData<UserDiscoveryResult>(["account", accountId, "selectedRecipient"])
        : null;
    
    if(!userId || !recipient || recipient.id !== userId){
        return (<div className="p-4 text-sm text-zinc-500">Select a recipient through phone discovery to start a chat. <Link href="/chat" className="underline">Back to chats</Link></div>);
    }

    return (
        <ChatArea mode="draft" draftUserId={recipient.id} userName={recipient.name} />
    )
}

export default function NewChatPage() {
    return <Suspense fallback={<p className="p-4 text-zinc-500">Loading draft…</p>}><NewChatPageContent /></Suspense>;
}
