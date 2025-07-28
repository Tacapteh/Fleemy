import axios from "axios";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

// Promise resolved once Firebase auth state is ready
let firebaseReadyResolve;
export const firebaseReady = new Promise((resolve) => {
  firebaseReadyResolve = resolve;
});

// Wait for the first auth state change to resolve firebaseReady
const unsubscribe = onAuthStateChanged(auth, () => {
  firebaseReadyResolve();
  unsubscribe();
});

// On utilise REACT_APP_API_URL si défini, sinon fallback en local
const base = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${base.replace(/\/$/, "")}/api`,
});

// Intercepteur pour AJOUTER le token avant chaque requête
api.interceptors.request.use(async (config) => {
  try {
    // Attendre que Firebase ait définitivement chargé l'état d'authentification
    await firebaseReady;

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
