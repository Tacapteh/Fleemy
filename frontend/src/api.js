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
  // ✅ FIXED for production: inject Firebase token into headers
  await firebaseReady; // on attend l'initialisation de Firebase

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken(); // ✅ FIXED token/projectId/trace
      console.log("token interceptor", token); // ✅ FIXED token/projectId/trace
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.error("[api] impossible d'obtenir le token Firebase:", e); // ✅ FIXED token/projectId/trace
    }
  }
  console.log("Token envoyé à l'API:", config.headers.Authorization);

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    console.error("[api] appel échoué:", error); // ✅ FIXED token/projectId/trace
    return Promise.reject(error);
  }
);

export default api;
