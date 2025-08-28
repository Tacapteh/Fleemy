import { auth } from "../firebase";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const DEMO = (process.env.REACT_APP_DISABLE_GOOGLE_AUTH || "false") === "true";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (DEMO && method !== "GET") {
    throw new Error("Demo mode: read-only");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as any),
  };
  if (!DEMO && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
    ...options,
    method,
    headers,
  });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return res.json();
}
