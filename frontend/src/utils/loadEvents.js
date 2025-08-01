// ✅ FIXED auth/token/ownerId
import api from "../api";
import { getAuth } from "firebase/auth";

export async function loadEvents(year, week) {
  const user = getAuth().currentUser;
  const ownerId = user?.uid;
  if (!ownerId) {
    console.error("ownerId non défini");
    return [];
  }

  try {
    const token = await user.getIdToken(); // ✅ CHECKED auth
    console.log("Token loadEvents", token); // ✅ CHECKED auth
    const { data } = await api.get(`/planning/week/${year}/${week}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("[loadEvents] réponse API", data);
    return data.events || [];
  } catch (error) {
    console.error("[loadEvents] erreur", error);
    return [];
  }
}
