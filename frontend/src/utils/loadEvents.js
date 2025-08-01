// ✅ FIXED pour production
import api from "../api";
import { getAuth } from "firebase/auth";

export async function loadEvents(year, week) {
  try {
    const user = getAuth().currentUser;
    const token = user ? await user.getIdToken() : null;
    if (!token) {
      console.error("Utilisateur non authentifi\u00e9");
      return [];
    }

    const { data } = await api.get(`/planning/week/${year}/${week}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("[loadEvents] r\u00e9ponse API", data);
    return data.events || [];
  } catch (error) {
    console.error("[loadEvents] erreur", error);
    return [];
  }
}
