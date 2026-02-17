import { MessageResponse } from "@/interface/Message.interface";
import api from "@/lib/api";

export const MessageService = {
  getMessages: async (conversationId: string, pageParam?: string):Promise<MessageResponse> => {
    const params = new URLSearchParams();
    params.append("limit", "20");
    if (pageParam) {
      params.append("cursor", pageParam);
    }
    const response = await api.get(`/messages/${conversationId}`, { params });
    return {
      items: response.data,
      nextCursor:
        response.data.length > 0
          ? response.data[response.data.length - 1].id
          : null,
    };
  },

  sendMessage: async (conversationId: string, content: string) => {
    const response = await api.post("/messages", { conversationId, content });
    return response.data;
  },
};
