import { useOutletContext } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useOutletContext();
  
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-800 dark:text-slate-100">Dashboard</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow transition-colors dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Bienvenue sur Fleemy</h2>
        <p className="text-gray-600 dark:text-slate-300">
          Votre outil de gestion tout-en-un pour le planning, les devis et les factures.
        </p>
        {user && (
          <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-500/20">
            <p className="text-sm text-blue-800 dark:text-blue-100">
              Connecté en tant que: <strong>{user.displayName || user.email}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
