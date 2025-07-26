import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Planning = lazy(() => import("./pages/Planning"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Clients = lazy(() => import("./pages/Clients"));
const NotFound = lazy(() => import("./pages/NotFound"));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-6">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="planning" element={<Planning />} />
            <Route path="quotes" element={<Quotes />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="clients" element={<Clients />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

import React, { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

function App() {
  const [user, setUser] = useState(null);

  const loginGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Utilisateur connecté :", result.user);
      setUser(result.user);
    } catch (error) {
      console.error("Erreur connexion :", error);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      {!user ? (
        <button
          onClick={loginGoogle}
          style={{
            padding: "10px 20px",
            background: "#4285F4",
            color: "white",
            border: "none",
            borderRadius: "5px",
          }}
        >
          Connexion avec Google
        </button>
      ) : (
        <div>
          <h2>Bienvenue, {user.displayName}</h2>
          <p>Email : {user.email}</p>
          <img
            src={user.photoURL}
            alt="Profil"
            style={{ borderRadius: "50%" }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
