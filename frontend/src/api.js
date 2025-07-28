import axios from "axios";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

const base = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${base.replace(/\/$/, "")}/api`,
});

// Promesse résolue une fois que Firebase a vérifié la session
let firebaseReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, () => {
    unsub();
    resolve();
  });
});

api.interceptors.request.use(async (config) => {
  // On attend la fin de l'initialisation Firebase
  await firebaseReady;

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.warn("Erreur lors de la récupération du token Firebase :", e);
    }
  }
  console.log("Token envoyé à l'API:", config.headers.Authorization);

  return config;
});

export default api;
