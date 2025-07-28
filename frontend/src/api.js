import axios from "axios";
import { auth } from "./firebase";

// On utilise REACT_APP_API_URL si défini, sinon fallback en local
const base = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${base.replace(/\/$/, "")}/api`,
});

// Intercepteur pour AJOUTER le token avant chaque requête
api.interceptors.request.use(async (config) => {
  try {
    // On attend que l’état d’auth soit prêt (évite les requêtes sans user au chargement)
    await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged(() => {
        unsub();
        resolve();
      });
    });

    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  } catch (e) {
    console.warn("Impossible de récupérer le token Firebase :", e);
  }

  return config;
});

export default api;
