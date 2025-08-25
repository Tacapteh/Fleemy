import { useOutletContext } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useOutletContext();
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Bienvenue sur Fleemy</h2>
        <p className="text-gray-600">
          Votre outil de gestion tout-en-un pour le planning, les devis et les factures.
        </p>
        {user && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              Connecté en tant que: <strong>{user.displayName || user.email}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
