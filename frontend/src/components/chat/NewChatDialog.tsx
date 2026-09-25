"use client";

import { UserService } from "@/services/user.service";
import { UserDiscoveryResult } from "@/interface/Conversation.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isValidPhoneNumber } from "react-phone-number-input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAxiosError } from "axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Loader2, Plus, UserIcon } from "lucide-react";
import { PhoneInputShadcn } from "../ui/phone-input";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

function DiscoveryDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const discovery = useMutation({
    mutationKey: ["account", accountId, "discovery"],
    mutationFn: UserService.discover,
    gcTime: 0,
  });
  const validPhone = isValidPhoneNumber(phoneNumber) && /^\+[1-9]\d{1,14}$/.test(phoneNumber);

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (validPhone && !discovery.isPending) discovery.mutate(phoneNumber);
  };

  const select = (recipient: UserDiscoveryResult) => {
    queryClient.setQueryData(["account", accountId, "selectedRecipient"], recipient);
    discovery.reset();
    setPhoneNumber("");
    setSubmitted(false);
    setOpen(false);
    router.push(`/chat/new?userId=${encodeURIComponent(recipient.id)}`);
  };

  const sessionFailure = discovery.isError && isAxiosError(discovery.error) &&
    discovery.error.response?.status === 401;
  const invalidFromServer = discovery.isError && isAxiosError(discovery.error) &&
    discovery.error.response?.status === 400;
  const rateLimited = discovery.isError && isAxiosError(discovery.error) &&
    discovery.error.response?.status === 429;
  const networkFailure = discovery.isError && isAxiosError(discovery.error) && !discovery.error.response;
  const found = discovery.data;

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) {
        setPhoneNumber("");
        setSubmitted(false);
        discovery.reset();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Start new chat">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-106.5">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
          <DialogDescription>Enter the full phone number of someone you know.</DialogDescription>
        </DialogHeader>
        <form onSubmit={search} className="grid gap-3 py-4">
          <PhoneInputShadcn
            aria-label="Recipient phone number"
            placeholder="+1 555 123 4567"
            value={phoneNumber}
            onChange={(value) => {
              setPhoneNumber(value || "");
              setSubmitted(false);
              discovery.reset();
            }}
          />
          <Button type="submit" disabled={discovery.isPending}>Search by phone</Button>
        </form>
        <div aria-live="polite" className="min-h-10">
          {((submitted && !validPhone) || invalidFromServer) && <p>Enter a complete phone number with country code.</p>}
          {discovery.isPending && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Searching…</p>}
          {discovery.isSuccess && !discovery.data && <p>No recipient found.</p>}
          {sessionFailure && <p>Your session has expired. Sign in again to search.</p>}
          {rateLimited && <p>Too many searches. Please try again in a minute.</p>}
          {networkFailure && <p>Network unavailable. Check your connection and try again.</p>}
          {discovery.isError && !sessionFailure && !invalidFromServer && !rateLimited && !networkFailure && <p>Search is temporarily unavailable. Please try again.</p>}
          {discovery.isSuccess && found && (
            <Button type="button" variant="ghost" className="w-full justify-start gap-3 h-auto p-3" onClick={() => select(found)}>
              <Avatar>
                {found.avatar && <AvatarImage src={found.avatar} alt="" />}
                <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
              </Avatar>
              <span>{found.name}</span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function NewChatDialog() {
  const accountId = useAuthStore((state) => state.user?.id);
  return accountId ? <DiscoveryDialog key={accountId} accountId={accountId} /> : null;
}
