import { RefreshResponse } from "@/interface/Auth.interface";
import api from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/useAuthStore";
import { onIdTokenChanged, User as FirebaseUser } from "firebase/auth";
import { useEffect } from "react";

export function useAuth() {
  const { setUser, setToken, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        try {
          if (firebaseUser) {
            setUser(firebaseUser);

            try {
              const { data } = await api.post<RefreshResponse>("auth/refresh");
              setUser(data.)
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
      },
    );
    return () => unsubscribe();
  }, [setUser, setToken, setLoading]);
}
