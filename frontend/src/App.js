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

import Login from "./Login";
import Dashboard from "./pages/Dashboard";
import Planning from "./pages/Planning";
import Quotes from "./pages/Quotes";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import ProfilePickerPage from "./pages/ProfilePickerPage";
import Sidebar from "./components/Sidebar";
import NotFound from "./pages/NotFound";
import { apiFetch } from "./lib/api";

// Composant qui gère la mise en page commune (Sidebar + Outlet)
function Layout({ user, onLogout }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar user={user} onLogout={onLogout} />
      <div style={{ flex: 1, padding: "20px" }}>
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
            const data = await apiFetch('/teams/my');

            if (!data?.success) {
              console.error('Error checking team membership:', data?.error);
            } else {
              const stillMember = data.teams?.some((t) => t.team_id === savedContext.teamId);

              if (stillMember) {
                // Contexte team toujours valide
                setChecking(false);
                return;
              }
            }
          }
        }

        // Pas de contexte valide, rediriger vers /profiles
        navigate('/profiles');
      } catch (err) {
        console.error('Error checking context:', err);
        navigate('/profiles');
      } finally {
        setChecking(false);
      }
    };

    checkContext();
  }, [user, navigate]);

  if (checking) {
    return <div className="flex items-center justify-center h-screen">Vérification du contexte...</div>;
  }

  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

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

  const handleLogout = async () => {
    await logout();
    contextStore.clear();
    setUser(null);
  };

  if (initializing) {
    return <div>Chargement du compte...</div>;
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <Router>
      <Routes>
        {/* Route de sélection de profil (sans sidebar) */}
        <Route path="/profiles" element={<ProfilePickerPage />} />
        
        {/* Routes avec team schedule (sans sidebar pour l'instant) */}
        <Route path="/team/:teamId/schedule" element={
          <AuthGuard user={user}>
            <Planning />
          </AuthGuard>
        } />
        
        {/* Layout englobe les autres pages et passe user via context */}
        <Route element={<Layout user={user} onLogout={handleLogout} />}>
          <Route path="/" element={
            <AuthGuard user={user}>
              <Navigate to="/dashboard" />
            </AuthGuard>
          } />
          <Route path="/dashboard" element={
            <AuthGuard user={user}>
              <Dashboard />
            </AuthGuard>
          } />
          <Route path="/planning" element={
            <AuthGuard user={user}>
              <Planning />
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
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
