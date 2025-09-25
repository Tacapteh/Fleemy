import React, { useState, useEffect } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function Login({ onLogin }) {
  const [error, setError] = useState("");
  const DEMO_MODE = process.env.REACT_APP_DISABLE_GOOGLE_AUTH === "true";

  // En mode démo, connecter automatiquement un utilisateur fictif
  useEffect(() => {
    if (DEMO_MODE) {
      const demoUser = {
        uid: 'demo-user',
        email: 'demo@example.com',
        displayName: 'Utilisateur Démo',
        photoURL: null,
        getIdToken: () => Promise.resolve('demo-token')
      };
      
      // Simuler une connexion immédiate
      setTimeout(() => {
        onLogin(demoUser);
      }, 100);
    }
  }, [DEMO_MODE, onLogin]);

  const handleLogin = async () => {
    if (DEMO_MODE) {
      // Mode démo - connexion automatique
      const demoUser = {
        uid: 'demo-user',
        email: 'demo@example.com',
        displayName: 'Utilisateur Démo',
        photoURL: null,
        getIdToken: () => Promise.resolve('demo-token')
      };
      onLogin(demoUser);
      return;
    }

    // Mode production - Google Auth
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

  // En mode démo, afficher un message de chargement
  if (DEMO_MODE) {
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
        <div style={{ marginBottom: "1rem" }}>
          <p>Mode démonstration</p>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

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
