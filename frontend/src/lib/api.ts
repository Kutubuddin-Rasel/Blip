import { RefreshResponse } from "@/interface/Auth.interface";
import { useAuthStore } from "@/store/useAuthStore";
import { retryForSameAccount, singleFlight } from "./session-rules";
import { endSession, installSession, sessionGeneration } from "./session";
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

type SessionRequest = InternalAxiosRequestConfig & { _retry?: boolean; _originUserId?: string | null };
const sessionEndpoint = (url?: string) => /(?:^|\/)auth\/(signin|signup|refresh|logout)(?:\?|$)/.test(url ?? "");

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: SessionRequest) => {
  if (config._originUserId === undefined) config._originUserId = useAuthStore.getState().user?.id ?? null;
  const token = useAuthStore.getState().token;
  if (token && !sessionEndpoint(config.url)) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const refreshSession = singleFlight(async (generation): Promise<RefreshResponse> => {
  const response = await api.post<RefreshResponse>("auth/refresh");
  await installSession(response.data, false, generation);
  return response.data;
}, sessionGeneration);

api.interceptors.response.use((response) => response, async (error: AxiosError) => {
  const original = error.config as SessionRequest | undefined;
  if (!original || error.response?.status !== 401 || original._retry || sessionEndpoint(original.url)) throw error;
  original._retry = true;
  const originalUserId = original._originUserId ?? null;
  if (!originalUserId) throw error;
  try {
    return await retryForSameAccount(
      originalUserId,
      () => useAuthStore.getState().user?.id ?? null,
      refreshSession,
      (token) => { original.headers.Authorization = `Bearer ${token}`; return api(original); },
    );
  }
  catch (refreshError) {
    if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) await endSession();
    else if (axios.isAxiosError(refreshError) && !refreshError.response) useAuthStore.getState().sessionError();
    throw refreshError;
  }
});

export default api;
