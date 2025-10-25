import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, logout } from "./firebase";
import { contextStore } from "./stores/contextStore";
import { SettingsProvider, useSettings } from "./context/SettingsContext";

import Login from "./Login";
import Dashboard from "./pages/Dashboard";
import Planning from "./pages/Planning";
import Quotes from "./pages/Quotes";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import SettingsPage from "./pages/SettingsPage";
import ProfilePickerPage from "./pages/ProfilePickerPage";
import Todo from "./pages/Todo";
import Sidebar from "./components/Sidebar";
import NotFound from "./pages/NotFound";
import { apiFetch } from "./lib/api";
import {
  hasFreshTeamsCache,
  ensureTeamsCache,
  clearTeamsCache,
} from "./utils/teamCache";

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
        className="flex-1 bg-white transition-colors dark:bg-slate-900"
      >
        {/* Outlet = là où s’affichent les pages */}
        <Outlet context={{ user }} />
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
            const result = await ensureTeamsCache(
              () => apiFetch('/teams/my'),
              { forceRefresh: true },
            );

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
    let first = true;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (first) {
        setInitializing(false); // Firebase a fini d’initialiser
        first = false;
      }
    });
    return () => unsub();
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
      return <Login onLogin={setUser} />;
    }

    return (
      <Router>
        <Routes>
          {/* Route de sélection de profil (sans sidebar) */}
          <Route path="/profiles" element={<ProfilePickerPage />} />

          {/* Layout englobe les autres pages et passe user via context */}
          <Route element={<Layout user={user} onLogout={handleLogout} />}>
            <Route path="/" element={
              <AuthGuard user={user}>
                <Navigate to="/dashboard" />
              </AuthGuard>
            } />
            <Route path="/me" element={
              <AuthGuard user={user}>
                <Planning />
              </AuthGuard>
            } />
            <Route path="/team/:teamId" element={
              <AuthGuard user={user}>
                <Planning />
              </AuthGuard>
            } />
            <Route path="/dashboard" element={
              <AuthGuard user={user}>
                <Dashboard />
              </AuthGuard>
            } />
            <Route path="/quotes" element={
              <AuthGuard user={user}>
                <Quotes />
              </AuthGuard>
            } />
            <Route path="/invoices" element={
              <AuthGuard user={user}>
                <Invoices />
              </AuthGuard>
            } />
            <Route path="/clients" element={
              <AuthGuard user={user}>
                <Clients />
              </AuthGuard>
            } />
            <Route path="/todo" element={
              <AuthGuard user={user}>
                <Todo />
              </AuthGuard>
            } />
            <Route path="/settings" element={
              <AuthGuard user={user}>
                <SettingsPage />
              </AuthGuard>
            } />
            <Route path="*" element={<NotFound />} />
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
