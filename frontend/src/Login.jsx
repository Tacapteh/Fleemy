import React from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function Login({ onLogin }) {
  const demoMode =
    (process.env.REACT_APP_DISABLE_GOOGLE_AUTH || "false") === "true";

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const token = await user.getIdToken();
      console.log("token login", token);
      localStorage.setItem("authToken", token);

      onLogin(user);
    } catch (error) {
      console.error("Erreur lors de la connexion :", error);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      {!demoMode ? (
        <button
          onClick={handleLogin}
          style={{
            padding: "12px 24px",
            backgroundColor: "#4285F4",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          Se connecter avec Google
        </button>
      ) : (
        <div style={{ padding: "16px", background: "#fef3c7", borderRadius: "6px" }}>
          Mode démo : authentification désactivée (lecture seule)
        </div>
      )}
    </div>
  );
}
