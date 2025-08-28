import React from 'react';
import { NavLink } from 'react-router-dom';

const menuItems = [
  { id: 'dashboard', name: 'Dashboard', icon: '📊', to: '/' },
  { id: 'planning', name: 'Planning', icon: '📅', to: '/planning' },
  { id: 'quotes', name: 'Devis', icon: '📋', to: '/quotes' },
  { id: 'invoices', name: 'Factures', icon: '🧾', to: '/invoices' },
  { id: 'clients', name: 'Clients', icon: '👥', to: '/clients' },
];

export default function Sidebar({ user, onLogout }) {
  return (
    <div className="w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col min-h-screen">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">📊</div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Fleemy</h1>
            <p className="text-xs text-gray-500">Outil tout-en-un</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {user && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
              {user.name ? user.name.charAt(0).toUpperCase() : ''}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {user.name ?? ''}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.email ?? ''}</p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
            >
              Se déconnecter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
