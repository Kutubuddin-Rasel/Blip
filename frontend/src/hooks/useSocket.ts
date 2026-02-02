import { socket } from "@/lib/socket";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect } from "react";

export function useSocket() {
  const { token, user } = useAuthStore();
  const isAuthenticated = user ? true : false;
  useEffect(() => {
    if (isAuthenticated && token) {
      socket.auth = { token };
      socket.connect();

      socket.on("connect", () => console.log("Socket connected", socket.id));
      socket.on("connect_error", (error) =>
        console.error("Socket error", error),
      );
    } else {
      socket.disconnect();
    }
    return () => {
      socket.off("connect");
      socket.off("connect_error");
    };
  }, [isAuthenticated, token]);
}
