import { Conversation } from "@/interface/Conversation.interface";
import api from "@/lib/api";
import { AxiosRequestConfig } from "axios";

export const ChatService={
    getConversations: async(config?:AxiosRequestConfig)=>{
        const response = await api.get<Conversation[]>('/conversations',config);
        return response.data;
    }
}