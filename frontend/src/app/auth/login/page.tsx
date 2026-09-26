'use client';

import PhoneLogin from "@/components/auth/PhoneLogin";
import { bootstrapSession } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Loginpage() {
  const status = useAuthStore((state) => state.status);
  const router = useRouter();
  useEffect(() => { if (status === "authenticated" || status === "cached") router.replace("/chat"); }, [status, router]);
  if (status === "bootstrapping" || status === "authenticated" || status === "cached") return <div className="p-6">Opening chats…</div>;
  if (status === "error") return <div role="alert" className="p-6">Could not check your session. <button className="underline" onClick={() => void bootstrapSession()}>Retry</button></div>;
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <PhoneLogin/>
    </div>
  )
}
