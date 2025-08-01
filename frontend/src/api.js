import axios from "axios";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { API_URL } from "./config";

const base = API_URL;

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
  // ✅ FIXED pour production: injection du token Firebase dans les headers
  await firebaseReady; // on attend l'initialisation de Firebase

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.warn("Erreur lors de la récupération du token Firebase :", e);
    }
  }
  console.log("Token envoyé à l'API:", config.headers.Authorization);

  return config;
});

export default api;
