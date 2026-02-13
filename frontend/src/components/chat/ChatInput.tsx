import { ChatInputProps } from "@/interface/Conversation.interface";
import { useState } from "react"
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Send } from "lucide-react";


export default function ChatInput({onSend,disable}:ChatInputProps) {
    const [message,setMessage] = useState("");
    const handleSend = ()=>{
        if(!message.trim()){
            return null;
        }
        onSend(message);
        setMessage("");
    }
  return (
    <div className="p-4 border-t flex gap-2 bg-white dark:bg-zinc-950">
        <Input
        placeholder="Message"
        value={message}
        onChange={(e)=>setMessage(e.target.value)}
        disabled={disable}
         />
         <Button onClick={handleSend} disabled={disable || !message.trim()} size='icon'>
            <Send className="w-4 h-4" />
         </Button>
    </div>
  )
}
