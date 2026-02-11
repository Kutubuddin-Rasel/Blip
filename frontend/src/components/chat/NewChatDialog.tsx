"use client";
import { UserService } from "@/services/user.service";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
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
import { Input } from "../ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export default function NewChatDialog() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const router = useRouter();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["users", search],
      queryFn: ({ pageParam }) =>
        UserService.getAllUsers(pageParam || undefined, search),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: undefined as string | undefined,
    });

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  const handleUserClick = (userId: string,userName:string) => {
    setOpen(true);
    router.push(`/chat/new?userId=${userId}&userName=${encodeURIComponent(userName)}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-106.5">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
          <DialogDescription>
            Search for a user to start a conversation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            placeholder="Search name or phone...."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-col gap-2 mt-2 h-75 overflow-y-auto">
            {isLoading && (
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-500" />
            )}
            {!isLoading && data?.pages[0].items.length === 0 && (
              <p className="text-center text-xl text-zinc-900">
                No users found.
              </p>
            )}
            {data?.pages.map((page, i) => (
              <div key={i}>
                {page.items.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => handleUserClick(user.id,user.name)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                  >
                    <Avatar>
                      <AvatarImage src={user.avatar || ""}>
                        <AvatarFallback>
                          <UserIcon className="h-4 w-4" />
                        </AvatarFallback>
                      </AvatarImage>
                    </Avatar>
                    <div className="font-medium text-sm">{user.name}</div>
                    <div className="text-xs text-zinc-500 hidden sm:block">
                      {user.phoneNumber}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={ref} className="h-4 w-full flex justify-center">
              {isFetchingNextPage && (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
