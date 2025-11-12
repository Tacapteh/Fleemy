import React, { Suspense, lazy, useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, logout, waitForAuth } from "./firebase";
import { contextStore } from "./stores/contextStore";
import { SettingsProvider, useSettings } from "./context/SettingsContext";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import { apiFetch } from "./lib/api";
import {
  hasFreshTeamsCache,
  ensureTeamsCache,
  clearTeamsCache,
} from "./utils/teamCache";

const CONTEXT_CHECK_TIMEOUT_MS = 7000;

const Login = lazy(() => import("./Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Planning = lazy(() => import("./pages/Planning"));
const BudgetPlanner = lazy(() => import("./pages/BudgetPlanner"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Documents = lazy(() => import("./pages/Documents"));
const Clients = lazy(() => import("./pages/Clients"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ProfilePickerPage = lazy(() => import("./pages/ProfilePickerPage"));
const Todo = lazy(() => import("./pages/Todo"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = ({ message = "Chargement..." }) => (
  <div className="flex min-h-[40vh] items-center justify-center text-slate-900 dark:text-slate-100">
    {message}
  </div>
);

// Composant qui gère la mise en page commune (Sidebar + Outlet)
function Layout({ user, onLogout }) {
  return (
    <div
      style={{ display: "flex" }}
      className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100"
    >
      <Sidebar user={user} onLogout={onLogout} />
      <div
        style={{ flex: 1, padding: "20px" }}
        className="relative flex-1 bg-white transition-colors dark:bg-slate-900"
      >
        <Header user={user} />
        <div className="pt-16">
          {/* Outlet = là où s’affichent les pages */}
          <Outlet context={{ user }} />
        </div>
      </div>
    </div>
  );
}

// Composant pour gérer la redirection post-login
function AuthGuard({ user, children }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkContext = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        // Vérifier si un contexte existe
        const savedContext = contextStore.get();
        
        if (savedContext) {
          // Valider que le contexte est toujours valide
          if (savedContext.type === 'solo') {
            // Contexte solo toujours valide
            setChecking(false);
            return;
          } else if (savedContext.type === 'team' && savedContext.teamId) {
            // Vérifier que l'utilisateur est toujours membre de l'équipe
            const ensurePromise = ensureTeamsCache(
              () => apiFetch('/teams/my'),
              { forceRefresh: true },
            )
              .then((value) => ({ status: 'resolved', value }))
              .catch((error) => ({ status: 'rejected', error }));

            const resultOrTimeout = await Promise.race([
              ensurePromise,
              new Promise((resolve) =>
                setTimeout(() => resolve({ status: 'timeout' }), CONTEXT_CHECK_TIMEOUT_MS),
              ),
            ]);

            if (resultOrTimeout.status === 'timeout') {
              console.warn(
                'AuthGuard: délai dépassé lors de la vérification du contexte, poursuite sans validation réseau.',
              );
              setChecking(false);
              return;
            }

            if (resultOrTimeout.status === 'rejected') {
              throw resultOrTimeout.error;
            }

            const result = resultOrTimeout.value;

            if (result.success) {
              const stillMember = Array.isArray(result.teams)
                ? result.teams.some((t) => t.team_id === savedContext.teamId)
                : false;

              if (stillMember) {
                // Contexte team toujours valide
                setChecking(false);
                return;
              }
            } else {
              console.error('Error checking team membership:', result.raw?.error || result.raw);
              clearTeamsCache();
            }
          }
        }

        // Pas de contexte valide, rediriger vers /profiles
        if (!hasFreshTeamsCache()) {
          ensureTeamsCache(() => apiFetch('/teams/my')).catch((prefetchError) => {
            console.error('Error preloading teams before profile picker:', prefetchError);
          });
        }
        navigate('/profiles');
      } catch (err) {
        console.error('Error checking context:', err);
        clearTeamsCache();
        navigate('/profiles');
      } finally {
        setChecking(false);
      }
    };

    checkContext();
  }, [user, navigate]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-900 dark:text-slate-100">
        Vérification du contexte...
      </div>
    );
  }

  return children;
}

function AppWithSettings() {
  const { settings, loading } = useSettings();
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const darkModeEnabled = !loading && Boolean(settings?.darkMode);

  useEffect(() => {
    let isMounted = true;
    let initialResolved = false;

    const finalizeInitialization = (nextUser) => {
      if (!isMounted) {
        return;
      }

      setUser(nextUser || null);

      if (!initialResolved) {
        initialResolved = true;
        setInitializing(false);
      }
    };

    waitForAuth()
      .then((resolvedUser) => {
        finalizeInitialization(resolvedUser);
      })
      .catch((error) => {
        console.error("Erreur lors de l'attente de l'authentification", error);
        finalizeInitialization(null);
      });

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        finalizeInitialization(nextUser);
      },
      (error) => {
        console.error("Erreur d'observation de l'authentification", error);
        finalizeInitialization(null);
      },
    );

    const timeoutId = typeof window !== "undefined"
      ? window.setTimeout(() => {
          if (!initialResolved) {
            console.warn(
              "Timeout lors de l'initialisation Firebase, affichage de l'écran de connexion en secours.",
            );
            finalizeInitialization(null);
          }
        }, 8000)
      : null;

    return () => {
      isMounted = false;

      if (typeof unsubscribe === "function") {
        unsubscribe();
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      clearTeamsCache();
      return;
    }

    if (hasFreshTeamsCache()) {
      return;
    }

    let cancelled = false;

    const prefetchTeams = async () => {
      try {
        const result = await ensureTeamsCache(() => apiFetch('/teams/my'));
        if (cancelled) {
          return;
        }

        if (!result.success) {
          console.error('Error prefetching teams:', result.raw?.error || result.raw);
        }
      } catch (prefetchError) {
        if (!cancelled) {
          console.error('Error prefetching teams:', prefetchError);
          clearTeamsCache();
        }
      }
    };

    prefetchTeams();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    contextStore.clear();
    setUser(null);
    clearTeamsCache();
  };

  const renderContent = () => {
    if (initializing) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center text-slate-900 dark:text-slate-100">
          Chargement du compte...
        </div>
      );
    }

    if (!user) {
      return (
        <Suspense fallback={<PageLoader message="Chargement de l'authentification..." />}>
          <Login onLogin={setUser} />
        </Suspense>
      );
    }

    return (
      <Router>
        <Routes>
          {/* Route de sélection de profil (sans sidebar) */}
          <Route
            path="/profiles"
            element={(
              <Suspense fallback={<PageLoader message="Chargement des profils..." />}>
                <ProfilePickerPage />
              </Suspense>
            )}
          />

          {/* Layout englobe les autres pages et passe user via context */}
          <Route element={<Layout user={user} onLogout={handleLogout} />}>
            <Route
              path="/"
              element={
                <AuthGuard user={user}>
                  <Navigate to="/dashboard" />
                </AuthGuard>
              }
            />
            <Route
              path="/me"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement du planning..." />}>
                    <Planning />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/team/:teamId"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement du planning..." />}>
                    <Planning />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement du tableau de bord..." />}>
                    <Dashboard />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/documents"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement des documents..." />}>
                    <Documents />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/quotes"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement des devis..." />}>
                    <Quotes />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/invoices"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement des factures..." />}>
                    <Invoices />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/clients"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement des clients..." />}>
                    <Clients />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/todo"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement des tâches..." />}>
                    <Todo />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <AuthGuard user={user}>
                  <Suspense fallback={<PageLoader message="Chargement des paramètres..." />}>
                    <SettingsPage />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="*"
              element={
                <Suspense fallback={<PageLoader message="Chargement de la page..." />}>
                  <NotFound />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </Router>
    );
  };

  return (
    <div
      className={`min-h-screen ${
        darkModeEnabled
          ? "dark bg-slate-900 text-slate-100"
          : "bg-white text-slate-900"
      }`}
    >
      {renderContent()}
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <AppWithSettings />
    </SettingsProvider>
  );
}

export default App;
