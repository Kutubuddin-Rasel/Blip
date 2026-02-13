"use client";

import { ChatListProps, Message } from "@/interface/Conversation.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useRef } from "react";


export default function ChatList({messages}:ChatListProps) {
    const {user} = useAuthStore();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(()=>{
        bottomRef.current?.scrollIntoView({behavior:'smooth'});
    },[messages])

    if(messages.length ===0 ){
        return(
            <div className="flex-1 flex items-center justify-center text-zinc-400 font-light italic">
                No Message yet.
            </div>
        );
    }
  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {
            messages.map((msg)=>{
                const isMe = msg.id === user?.id;
                return (
                    
                );
            })
        }
    </div>
  )
}
