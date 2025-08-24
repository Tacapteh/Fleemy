// ✅ FIXED auth/token/ownerId
import { getAuth } from "firebase/auth";
import normalizeEvent from "./normalizeEvent";

export async function loadEvents(year, week, teamId, signal) {
  const user = getAuth().currentUser;
  const ownerId = user?.uid;
  if (!ownerId) {
    throw new Error("ownerId non défini");
  }

  let token;
  try {
    token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
  } catch (err) {
    throw new Error("[loadEvents] impossible d'obtenir le token");
  }

  console.log("Token loadEvents", token); // ✅ FIXED token/projectId/trace
  let url = `/api/planning/week/${year}/${week}`;
  if (teamId) {
    url += `?team_id=${teamId}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => []);
  const events = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : [];
  console.log("[loadEvents] réponse API", data);
  return Array.isArray(events) ? events.map(normalizeEvent) : [];
}
