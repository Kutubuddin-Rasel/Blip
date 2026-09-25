"use client";

import ChatSidebar from "@/components/chat/ChatSidebar";
import { bootstrapSession } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const router = useRouter();
  useEffect(() => { if (status === "unauthenticated") router.replace("/auth/login"); }, [status, router]);
  if (status === "bootstrapping") return <div className="p-6">Restoring session…</div>;
  if (status === "error") return <div role="alert" className="p-6">Could not check your session. <button className="underline" onClick={() => void bootstrapSession()}>Retry</button></div>;
  if (status === "unauthenticated") return <div className="p-6">Sign in to continue…</div>;
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex"><ChatSidebar /></div>
      <main className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">{children}</main>
    </div>
  );
}
