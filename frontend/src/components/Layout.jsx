import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import api from '../api';
import Sidebar from './Sidebar';


export default function Layout() {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('fleemy_session_token');
    async function check() {
      if (token) {
        try {
          const response = await api.get('/auth/me');
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
