import React, { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function Login({ onLogin }) {
  const [error, setError] = useState("");

  const handleLogin = async () => {
    try {
      setError("");
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const token = await user.getIdToken();
      console.log("token login", token);
      localStorage.setItem("authToken", token);

      onLogin(user);
    } catch (error) {
      const message =
        error.code === "auth/api-key-not-valid"
          ? "Clé API Firebase invalide. Vérifiez votre configuration."
          : "Erreur lors de la connexion.";
      setError(message);
      console.error(message, error);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        flexDirection: "column",
      }}
    >
      {error && (
        <p style={{ color: "red", marginBottom: "1rem", textAlign: "center" }}>
          {error}
        </p>
      )}
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
    </div>
  );
}
