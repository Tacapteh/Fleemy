import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './Sidebar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Layout() {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('fleemy_session_token');
    async function check() {
      if (token) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setUser(response.data);
          setSessionToken(token);
        } catch (e) {
          localStorage.removeItem('fleemy_session_token');
        }
      }
    }
    check();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('fleemy_session_token');
    setUser(null);
    setSessionToken(null);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 overflow-auto p-6">
        <Outlet context={{ user, sessionToken }} />
      </main>
    </div>
  );
}
