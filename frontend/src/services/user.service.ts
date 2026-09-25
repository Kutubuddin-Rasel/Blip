import { UserDiscoveryResult } from "@/interface/Conversation.interface";
import api from "@/lib/api";

export const UserService = {
  discover: async (phoneNumber: string): Promise<UserDiscoveryResult | null> => {
    const response = await api.post<UserDiscoveryResult | null>("/user/discover", {
      phoneNumber,
    });
    return response.data;
  },
};
