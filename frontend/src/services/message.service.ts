import { Message, MessageResponse } from "@/interface/Message.interface";
import api from "@/lib/api";

export const MessageService = {
  getMessages: async (conversationId: string, pageParam?: string):Promise<MessageResponse> => {
    const params = new URLSearchParams();
    params.append("limit", "20");
    if (pageParam) {
      params.append("cursor", pageParam);
    }
    const response = await api.get<MessageResponse>(`/messages/${conversationId}`, { params });
    return response.data;
  },

  sendMessage: async (conversationId: string, content: string, clientMessageId: string): Promise<Message> => {
    const response = await api.post<Message>("/messages", { conversationId, content, clientMessageId });
    return response.data;
  },
};
