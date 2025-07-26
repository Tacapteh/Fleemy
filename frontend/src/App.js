import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";

import Login from "./Login";
import Dashboard from "./pages/Dashboard";
import Planning from "./pages/Planning";
import Quotes from "./pages/Quotes";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import Sidebar from "./components/Sidebar";

// Composant qui gère la mise en page commune (Sidebar + Outlet)
function Layout({ user, onLogout }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar onLogout={onLogout} />
      <div style={{ flex: 1, padding: "20px" }}>
        {/* Outlet = là où s’affichent les pages */}
        <Outlet context={{ user }} />
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <Router>
      <Routes>
        {/* Layout englobe toutes les pages et passe user via context */}
        <Route element={<Layout user={user} onLogout={handleLogout} />}>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/clients" element={<Clients />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
