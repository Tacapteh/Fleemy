import React, { useCallback, useEffect, useState } from "react";
import {
  signInWithGoogle,
  getGoogleRedirectResult,
  GOOGLE_SIGN_IN_STATUS,
} from "./firebase";

const INVALID_API_KEY_CODES = new Set([
  "auth/api-key-not-valid",
  "auth/invalid-api-key",
]);

const REDIRECT_IN_PROGRESS_MESSAGE =
  "Redirection vers Google… Veuillez finaliser la connexion.";

const REDIRECT_RECOVERABLE_ISSUE_MESSAGE =
  "Google n'a pas pu s'ouvrir automatiquement. Autorisez les popups et les cookies tiers, puis réessayez.";

const DEFAULT_LOGIN_ERROR = "Erreur lors de la connexion.";

const GoogleIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M23.492 12.273c0-.851-.076-1.67-.218-2.455H12v4.645h6.47a5.531 5.531 0 0 1-2.403 3.63v3.02h3.887c2.277-2.096 3.538-5.186 3.538-8.84Z"
      fill="#4285F4"
    />
    <path
      d="M12 24c3.24 0 5.956-1.073 7.941-2.887l-3.887-3.02c-1.08.726-2.462 1.157-4.054 1.157-3.118 0-5.759-2.105-6.703-4.946H1.28v3.11C3.255 21.442 7.302 24 12 24Z"
      fill="#34A853"
    />
    <path
      d="M5.297 14.304A7.203 7.203 0 0 1 4.905 12c0-.798.137-1.572.392-2.304V6.586H1.28A11.995 11.995 0 0 0 0 12c0 1.91.455 3.715 1.28 5.414l4.017-3.11Z"
      fill="#FBBC04"
    />
    <path
      d="M12 4.74c1.763 0 3.344.606 4.59 1.794l3.435-3.435C17.956 1.198 15.24 0 12 0 7.302 0 3.255 2.558 1.28 6.586l4.017 3.11C6.241 6.845 8.882 4.74 12 4.74Z"
      fill="#EA4335"
    />
  </svg>
);

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
      const statusFromResult = result?.status;

      if (user) {
        await persistUser(user);
        return;
      }

      if (statusFromResult === GOOGLE_SIGN_IN_STATUS.REDIRECT_TRIGGERED) {
        setStatus(REDIRECT_IN_PROGRESS_MESSAGE);
        return;
      }

      if (statusFromResult === GOOGLE_SIGN_IN_STATUS.RECOVERABLE_ERROR) {
        setStatus(REDIRECT_RECOVERABLE_ISSUE_MESSAGE);
        return;
      }

      setError(DEFAULT_LOGIN_ERROR);
    } catch (error) {
      console.error("Erreur lors de la tentative de connexion", error);

      if (INVALID_API_KEY_CODES.has(error?.code)) {
        setError("Clé API Firebase invalide ou absente. Vérifiez votre fichier .env.");
      } else {
        setError(DEFAULT_LOGIN_ERROR);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-80 w-80 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-20%] h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute left-[-10%] bottom-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-10 shadow-2xl backdrop-blur">
          <div className="mb-8">
            <span className="inline-flex items-center rounded-full border border-blue-400/40 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-blue-200">
              Portail sécurisé
            </span>
            <h1 className="mt-6 text-3xl font-semibold text-white sm:text-4xl">
              Connectez-vous à Fleemy
            </h1>
            <p className="mt-4 text-sm text-slate-300 sm:text-base">
              Accédez à votre espace de gestion en toute sécurité et retrouvez vos projets, vos équipes et vos indicateurs clés en un clin d'œil.
            </p>
          </div>

          {error ? (
            <div className="mb-6 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : status ? (
            <div className="mb-6 rounded-xl border border-blue-400/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
              {status}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-700/60 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-70"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200 group-hover:ring-slate-300">
              <GoogleIcon />
            </span>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400/70 border-t-blue-500" />
                Connexion…
              </span>
            ) : (
              <span className="text-base">Se connecter avec Google</span>
            )}
          </button>

          <p className="mt-8 text-xs text-slate-400 sm:text-sm">
            Fleemy s'appuie sur l'authentification Google pour protéger vos données. En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
          </p>
        </div>
      </div>
    </div>
  );
}
