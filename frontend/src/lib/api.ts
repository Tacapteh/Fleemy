import { auth } from "../firebase";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const baseUrl = (import.meta as any).env.VITE_API_BASE_URL || "";
  const disableAuth = (import.meta as any).env.VITE_DISABLE_GOOGLE_AUTH === "true";
  const method = (options.method || "GET").toUpperCase();
  if (disableAuth && method !== "GET") {
    throw new Error("Demo mode: read-only");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as any),
  };
  if (!disableAuth && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    method,
    headers,
  });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return res.json();
}
