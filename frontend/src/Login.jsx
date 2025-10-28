import React, { useCallback, useEffect, useState } from "react";
import { signInWithGoogle, getGoogleRedirectResult } from "./firebase";

const INVALID_API_KEY_CODES = new Set([
  "auth/api-key-not-valid",
  "auth/invalid-api-key",
]);

const RECOVERABLE_ERROR_CODES = new Set([
  "auth/network-request-failed",
  "auth/internal-error",
]);

const REDIRECT_IN_PROGRESS_MESSAGE =
  "Redirection vers Google… Veuillez finaliser la connexion.";

const DEFAULT_LOGIN_ERROR = "Erreur lors de la connexion.";

export default function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const persistUser = useCallback(
    async (user) => {
      if (!user) {
        return;
      }

      let token = null;

      try {
        token = await user.getIdToken();
      } catch (initialError) {
        console.warn(
          "Impossible de récupérer le token Firebase, tentative de rafraîchissement…",
          initialError
        );

        try {
          token = await user.getIdToken(true);
        } catch (refreshError) {
          console.error(
            "Échec de récupération du token Firebase après rafraîchissement",
            refreshError
          );
        }
      }

      if (token && typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem("authToken", token);
        } catch (storageError) {
          console.warn(
            "Impossible d'enregistrer le token localement",
            storageError
          );
        }
      }

      onLogin(user);
    },
    [onLogin]
  );

  useEffect(() => {
    let mounted = true;

    getGoogleRedirectResult()
      .then((result) => {
        if (!mounted || !result?.user) {
          return null;
        }

        setStatus("");
        setError("");
        setLoading(true);

        return persistUser(result.user)
          .catch((persistError) => {
            console.error("Erreur lors du traitement du résultat Google", persistError);
            if (mounted) {
              setError(DEFAULT_LOGIN_ERROR);
            }
          })
          .finally(() => {
            if (mounted) {
              setLoading(false);
            }
          });
      })
      .catch((redirectError) => {
        console.error("Erreur de récupération de la connexion Google", redirectError);
        if (mounted) {
          setError(DEFAULT_LOGIN_ERROR);
        }
      });

    return () => {
      mounted = false;
    };
  }, [persistUser]);

  const handleLogin = async () => {
    setError("");
    setStatus("");
    setLoading(true);

    try {
      const result = await signInWithGoogle();
      const user = result?.user;

      if (!user) {
        setStatus(REDIRECT_IN_PROGRESS_MESSAGE);
        return;
      }

      await persistUser(user);
    } catch (error) {
      console.error("Erreur lors de la tentative de connexion", error);

      if (INVALID_API_KEY_CODES.has(error?.code)) {
        setError("Clé API Firebase invalide ou absente. Vérifiez votre fichier .env.");
      } else if (RECOVERABLE_ERROR_CODES.has(error?.code)) {
        setError(
          "Impossible de contacter Google. Vérifiez votre connexion internet et autorisez les popups puis réessayez."
        );
      } else {
        setError(DEFAULT_LOGIN_ERROR);
      }
    } finally {
      setLoading(false);
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
      {!error && status && (
        <p style={{ color: "#333", marginBottom: "1rem", textAlign: "center" }}>
          {status}
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
          opacity: loading ? 0.8 : 1,
          pointerEvents: loading ? "none" : "auto",
        }}
      >
        {loading ? "Connexion…" : "Se connecter avec Google"}
      </button>
    </div>
  );
}
