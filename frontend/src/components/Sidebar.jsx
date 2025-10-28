import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { contextStore } from '../stores/contextStore';
import {
  LayoutDashboard,
  Calendar,
  Book,
  FileText,
  Receipt,
  Users as UsersIcon,
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from '../ui';

const menuItems = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { id: 'planning', name: 'Planning', icon: Calendar },
  { id: 'todo', name: 'Notes du jour', icon: Book, to: '/todo' },
  { id: 'quotes', name: 'Devis', icon: FileText, to: '/quotes' },
  { id: 'invoices', name: 'Factures', icon: Receipt, to: '/invoices' },
  { id: 'clients', name: 'Clients', icon: UsersIcon, to: '/clients' },
  { id: 'settings', name: 'Paramètres', icon: SettingsIcon, to: '/settings' },
];

const getMenuItemClass = (isActive, isCollapsed) =>
  `w-full flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition-colors ${
    isActive
      ? 'border border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/20 dark:text-blue-100'
      : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800/80'
  }`;

export default function Sidebar({ user, onLogout }) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const planningPath = React.useMemo(() => {
    const context = contextStore.get();
    if (context?.type === 'team' && context.teamId) {
      return `/team/${context.teamId}`;
    }
    if (location.pathname.startsWith('/team/')) {
      return location.pathname;
    }
    return '/me';
  }, [location.pathname]);

  const isPlanningActive =
    location.pathname === '/me' || location.pathname.startsWith('/team/');

  return (
    <div className={`flex min-h-screen ${isCollapsed ? 'w-20' : 'w-64'} flex-col border-r border-gray-200 bg-white shadow-lg transition-all duration-300 dark:border-slate-800 dark:bg-slate-900`}>
      {/* Header avec logo et bouton toggle */}
      <div className="relative border-b border-gray-200 p-6 transition-colors dark:border-slate-800">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <LayoutDashboard
            aria-hidden="true"
            className="h-8 w-8 text-blue-600 dark:text-blue-400"
          />
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100">Fleemy</h1>
              <p className="text-xs text-gray-500 dark:text-slate-400">Outil tout-en-un</p>
            </div>
          )}
        </div>

        {/* Bouton toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-8 rounded-full border border-gray-200 bg-white p-1 shadow-md transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label={isCollapsed ? 'Développer le menu' : 'Réduire le menu'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-600 dark:text-slate-300" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-slate-300" />
          )}
        </button>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const IconComponent = item.icon;

            return (
              <li key={item.id}>
                {item.id === 'planning' ? (
                  <Link
                    to={planningPath}
                    className={getMenuItemClass(isPlanningActive, isCollapsed)}
                    aria-label={item.name}
                    aria-current={isPlanningActive ? 'page' : undefined}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <IconComponent aria-hidden="true" className="h-5 w-5" />
                    {!isCollapsed && <span className="font-medium">{item.name}</span>}
                  </Link>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => getMenuItemClass(isActive, isCollapsed)}
                    aria-label={item.name}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <IconComponent aria-hidden="true" className="h-5 w-5" />
                    {!isCollapsed && <span className="font-medium">{item.name}</span>}
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      
      {user && (
        <div className="border-t border-gray-200 p-4 transition-colors dark:border-slate-800">
          {!isCollapsed ? (
            <>
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() :
                   user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-slate-100">
                    {user.displayName || user.email || 'Utilisateur'}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400">{user.email || ''}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  to="/profiles"
                  className="flex-1 rounded border border-blue-200 px-2 py-1 text-center text-sm text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800 dark:border-blue-400/40 dark:text-blue-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                >
                  Changer d'équipes
                </Link>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    Se déconnecter
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() :
                 user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <Link
                to="/profiles"
                className="rounded border border-blue-200 p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400/40 dark:text-blue-300 dark:hover:bg-blue-500/10"
                title="Changer d'équipes"
              >
                <UsersIcon aria-hidden="true" className="h-5 w-5" />
              </Link>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="rounded border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Se déconnecter"
                >
                  <LogOut aria-hidden="true" className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
