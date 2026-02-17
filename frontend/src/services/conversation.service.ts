import { Conversation, ConversationResponse, CreatedConversation } from "@/interface/Conversation.interface";
import api from "@/lib/api";
import { AxiosError, AxiosRequestConfig } from "axios";

export const ChatService={
    getConversations: async(config?:AxiosRequestConfig)=>{
        try {
            const response = await api.get<Conversation[]>('/conversations',config);
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            throw new Error(axiosError.message)
        }
    },

    createConversation: async(userIds:string[],initialMessage?:string)=>{
        try {
            const response = await api.post<CreatedConversation>('/conversations/create',{
                userIds,
                initialMessage
            })
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            throw new Error(axiosError.message)
        }
    },

    getConversation: async(conversationId:string)=>{
        try {
            const response = await api.get<ConversationResponse>(`/conversations/${conversationId}`);
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;
            throw new Error(axiosError.message)
        }
    }
}