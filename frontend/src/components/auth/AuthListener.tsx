'use client';

import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";

export default function AuthListener(){
    useAuth();
    useSocket();
    return null;
}