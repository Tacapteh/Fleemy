// ✅ FIXED auth/token/ownerId
import api from "../api";
import { getAuth } from "firebase/auth";
import normalizeEvent from "./normalizeEvent";

export async function loadEvents(year, week, teamId) {
  const user = getAuth().currentUser;
  const ownerId = user?.uid;
  if (!ownerId) {
    console.error("ownerId non défini");
    return [];
  }

  let token;
  try {
    token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
  } catch (err) {
    console.error("[loadEvents] impossible d'obtenir le token", err); // ✅ FIXED token/projectId/trace
    return [];
  }

  try {
    console.log("Token loadEvents", token); // ✅ FIXED token/projectId/trace
    let url = `/planning/week/${year}/${week}`;
    if (teamId) {
      url += `?team_id=${teamId}`;
    }
    const { data } = await api.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("[loadEvents] réponse API", data);
    const events = Array.isArray(data.events) ? data.events.map(normalizeEvent) : [];
    return events;
  } catch (error) {
    console.error("[loadEvents] appel API échoué", error); // ✅ FIXED token/projectId/trace
    return [];
  }
}
