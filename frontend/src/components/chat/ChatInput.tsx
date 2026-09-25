import { ChatInputProps } from "@/interface/Conversation.interface";
import { useState } from "react"
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Send } from "lucide-react";


export default function ChatInput({onSend,onEdit,disable,clearOnSuccess = false,failure}:ChatInputProps) {
    const [message,setMessage] = useState("");
    const handleSend = async ()=>{
        if(!message.trim()){
            return null;
        }
        if (failure && !failure.retryable) return;
        if (clearOnSuccess) {
            try {
                await onSend(message);
                setMessage("");
            } catch {
                // The mutation reports the failure; keep the draft for retry.
            }
        } else {
            onSend(message);
            setMessage("");
        }
    }
  return (
    <div className="p-4 border-t bg-white dark:bg-zinc-950">
      {failure && <p role="alert" className="mb-2 text-sm text-red-600">{failure.message}</p>}
      <div className="flex gap-2">
        <Input
        placeholder="Message"
        value={message}
        onChange={(e)=>{ setMessage(e.target.value); onEdit?.(); }}
        disabled={disable}
        maxLength={4000}
         />
         <Button onClick={handleSend} disabled={disable || !message.trim() || !!(failure && !failure.retryable)} size={failure?.retryable ? 'default' : 'icon'}>
            {failure?.retryable ? 'Retry' : <Send className="w-4 h-4" />}
         </Button>
      </div>
    </div>
  )
}
