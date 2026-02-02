import { RefreshResponse } from "@/interface/axiosInterface";
import api from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { onIdTokenChanged } from "firebase/auth";
import { useEffect } from "react";

export function useAuth() {
  const { setUser, setToken, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);

          try {
            const { data } = await api.post<RefreshResponse>("auth/refresh");
            setToken(data.accessToken);
          } catch (error) {
            console.error("Backend refresh failed", error);
            setToken(null);
          }
        } else {
          setUser(null);
          setToken(null);
        }
      } catch (error) {
        console.error("Auth async error", error);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [setUser, setToken, setLoading]);
}
