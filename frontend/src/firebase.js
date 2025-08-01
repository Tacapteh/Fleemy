import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBNNGQf0tz3mtnDL-E0dEYSi9ce34lZkDw",
  authDomain: "fleemy-21118.firebaseapp.com",
  projectId: "fleemy-21118",
  storageBucket: "fleemy-21118.appspot.com",
  messagingSenderId: "273204841300",
  appId: "1:273204841300:web:15f50e65c64dd87cb556c1",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

const logout = async () => {
  await signOut(auth);
  localStorage.removeItem("authToken");
};

export { auth, googleProvider, db, logout };

window.auth = auth;
