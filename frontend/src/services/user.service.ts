import { AllUsers } from "@/interface/Conversation.interface";
import api from "@/lib/api"
import { URLSearchParams } from "url";

export const UserService={
    getAllUsers: async(pageParam?:string,search?:string):Promise<AllUsers>=>{
        const params = new URLSearchParams();
        if(pageParam){params.append("cursor",pageParam)}
        if(search){params.append("search",search)}
        const response = await api.get(`/users?${params.toString()}`);
        return response.data;
    }
}