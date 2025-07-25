import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Utility functions
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR');
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR' 
  }).format(amount);
};

const getCurrentWeek = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000;
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.ceil((day + start.getDay() + 1) / 7);
};

// Authentication Screen
const AuthScreen = ({ onLogin }) => {
  const handleLogin = () => {
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  useEffect(() => {
    // Check for session_id in URL fragment
    const hash = window.location.hash;
    if (hash.includes('session_id=')) {
      const sessionId = hash.split('session_id=')[1].split('&')[0];
      onLogin(sessionId);
    }
  }, [onLogin]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full mx-4">
        <div className="text-6xl mb-6">📊</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Fleemy</h1>
        <p className="text-gray-600 mb-8">Votre outil tout-en-un pour indépendants</p>
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
        >
          Se connecter
        </button>
      </div>
    </div>
  );
};

// Sidebar Navigation
const Sidebar = ({ currentPage, setCurrentPage, user, onLogout, isMobile, setIsMobileMenuOpen }) => {
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: '📊' },
    { id: 'planning', name: 'Planning', icon: '📅' },
    { id: 'tasks', name: 'Tâches', icon: '✅' },
    { id: 'todos', name: 'To-do List', icon: '📝' },
    { id: 'clients', name: 'Clients', icon: '👥' },
    { id: 'quotes', name: 'Devis', icon: '📋' },
    { id: 'invoices', name: 'Factures', icon: '🧾' },
    { id: 'settings', name: 'Paramètres', icon: '⚙️' }
  ];

  const handleMenuClick = (pageId) => {
    setCurrentPage(pageId);
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <div className="h-full bg-white shadow-lg border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">📊</div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Fleemy</h1>
            <p className="text-xs text-gray-500">Outil tout-en-un</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map(item => (
            <li key={item.id}>
              <button
                onClick={() => handleMenuClick(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                  currentPage === item.id
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
};

// Dashboard Component
const Dashboard = ({ user, sessionToken }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiCall = async (url, options = {}) => {
    return await axios({
      url: `${API}${url}`,
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
  };

  const loadDashboard = async () => {
    try {
      const response = await apiCall('/dashboard');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-2xl">
        <h1 className="text-2xl font-bold mb-2">Bonjour, {user.name} ! 👋</h1>
        <p className="text-blue-100">Voici un aperçu de votre activité</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revenus du mois</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.monthly_revenue || 0)}
              </p>
            </div>
            <div className="text-3xl">💰</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total clients</p>
              <p className="text-2xl font-bold text-blue-600">{stats.total_clients || 0}</p>
            </div>
            <div className="text-3xl">👥</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tâches en cours</p>
              <p className="text-2xl font-bold text-orange-600">{stats.pending_todos_count || 0}</p>
            </div>
            <div className="text-3xl">📝</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Factures impayées</p>
              <p className="text-2xl font-bold text-red-600">{stats.unpaid_invoices_count || 0}</p>
            </div>
            <div className="text-3xl">🧾</div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prochains événements */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📅</span>
            Prochains événements
          </h2>
          <div className="space-y-3">
            {dashboardData?.upcoming_events?.length > 0 ? (
              dashboardData.upcoming_events.map(event => (
                <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{event.description}</p>
                    <p className="text-sm text-gray-600">{event.client_name}</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {event.day} {event.start_time}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">Aucun événement à venir</p>
            )}
          </div>
        </div>

        {/* Tâches en attente */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">✅</span>
            Tâches en attente
          </h2>
          <div className="space-y-3">
            {dashboardData?.pending_todos?.length > 0 ? (
              dashboardData.pending_todos.map(todo => (
                <div key={todo.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{todo.title}</p>
                    {todo.description && (
                      <p className="text-sm text-gray-600">{todo.description}</p>
                    )}
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    todo.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                    todo.priority === 'normal' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {todo.priority === 'urgent' ? 'Urgent' :
                     todo.priority === 'normal' ? 'Normal' : 'Faible'}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">Aucune tâche en attente</p>
            )}
          </div>
        </div>

        {/* Clients récents */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">👥</span>
            Clients récents
          </h2>
          <div className="space-y-3">
            {dashboardData?.recent_clients?.length > 0 ? (
              dashboardData.recent_clients.map(client => (
                <div key={client.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{client.name}</p>
                    {client.company && (
                      <p className="text-sm text-gray-600">{client.company}</p>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(client.created_at)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">Aucun client récent</p>
            )}
          </div>
        </div>

        {/* Devis en cours */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📋</span>
            Devis en cours
          </h2>
          <div className="space-y-3">
            {dashboardData?.pending_quotes?.length > 0 ? (
              dashboardData.pending_quotes.map(quote => (
                <div key={quote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">{quote.title}</p>
                    <p className="text-sm text-gray-600">{quote.client_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">{formatCurrency(quote.total)}</p>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      quote.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {quote.status === 'sent' ? 'Envoyé' : 'Brouillon'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">Aucun devis en cours</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Placeholder Components for other pages
const Planning = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">📅 Planning</h1>
    <p className="text-gray-600">Module de planning interactif en développement...</p>
  </div>
);

const Tasks = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">✅ Tâches hebdomadaires</h1>
    <p className="text-gray-600">Module de gestion des tâches en développement...</p>
  </div>
);

const TodoList = ({ sessionToken }) => {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'normal',
    due_date: ''
  });

  const apiCall = async (url, options = {}) => {
    return await axios({
      url: `${API}${url}`,
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
  };

  const loadTodos = async () => {
    try {
      const response = await apiCall('/todos');
      setTodos(response.data);
    } catch (error) {
      console.error('Error loading todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTodo) {
        await apiCall(`/todos/${editingTodo.id}`, {
          method: 'PUT',
          data: formData
        });
      } else {
        await apiCall('/todos', {
          method: 'POST',
          data: formData
        });
      }
      setShowModal(false);
      setEditingTodo(null);
      setFormData({ title: '', description: '', priority: 'normal', due_date: '' });
      loadTodos();
    } catch (error) {
      console.error('Error saving todo:', error);
    }
  };

  const handleToggle = async (todoId) => {
    try {
      await apiCall(`/todos/${todoId}/toggle`, { method: 'PUT' });
      loadTodos();
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const handleDelete = async (todoId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
      try {
        await apiCall(`/todos/${todoId}`, { method: 'DELETE' });
        loadTodos();
      } catch (error) {
        console.error('Error deleting todo:', error);
      }
    }
  };

  const handleEdit = (todo) => {
    setEditingTodo(todo);
    setFormData({
      title: todo.title,
      description: todo.description || '',
      priority: todo.priority,
      due_date: todo.due_date ? new Date(todo.due_date).toISOString().split('T')[0] : ''
    });
    setShowModal(true);
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const priorityColors = {
    low: 'bg-green-100 text-green-700',
    normal: 'bg-yellow-100 text-yellow-700',
    urgent: 'bg-red-100 text-red-700'
  };

  const priorityLabels = {
    low: 'Faible',
    normal: 'Normal',
    urgent: 'Urgent'
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">📝 To-do List</h1>
        <button
          onClick={() => {
            setEditingTodo(null);
            setFormData({ title: '', description: '', priority: 'normal', due_date: '' });
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all"
        >
          + Nouvelle tâche
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {todos.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Aucune tâche</h3>
              <p className="text-gray-500">Commencez par créer votre première tâche !</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {todos.map(todo => (
                <div key={todo.id} className="p-4 hover:bg-gray-50 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <button
                        onClick={() => handleToggle(todo.id)}
                        className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          todo.completed 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : 'border-gray-300 hover:border-green-500'
                        }`}
                      >
                        {todo.completed && '✓'}
                      </button>
                      
                      <div className="flex-1">
                        <h3 className={`font-medium ${
                          todo.completed ? 'line-through text-gray-500' : 'text-gray-800'
                        }`}>
                          {todo.title}
                        </h3>
                        {todo.description && (
                          <p className="text-sm text-gray-600 mt-1">{todo.description}</p>
                        )}
                        <div className="flex items-center space-x-3 mt-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[todo.priority]}`}>
                            {priorityLabels[todo.priority]}
                          </span>
                          {todo.due_date && (
                            <span className="text-xs text-gray-500">
                              📅 {formatDate(todo.due_date)}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            Créée le {formatDate(todo.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(todo)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(todo.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                {editingTodo ? 'Modifier la tâche' : 'Nouvelle tâche'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titre *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows="3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priorité
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Faible</option>
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date d'échéance
                    </label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-all"
                  >
                    {editingTodo ? 'Modifier' : 'Créer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Clients = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">👥 Clients</h1>
    <p className="text-gray-600">Module de gestion des clients en développement...</p>
  </div>
);

const Quotes = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">📋 Devis</h1>
    <p className="text-gray-600">Module de devis en développement...</p>
  </div>
);

const Invoices = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">🧾 Factures</h1>
    <p className="text-gray-600">Module de facturation en développement...</p>
  </div>
);

const Settings = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">⚙️ Paramètres</h1>
    <p className="text-gray-600">Module de paramètres en développement...</p>
  </div>
);

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = async (sessionId) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API}/auth/login`, { session_id: sessionId });
      setUser(response.data.user);
      setSessionToken(response.data.session_token);
      localStorage.setItem('fleemy_session_token', response.data.session_token);
      // Clear the hash from URL
      window.history.replaceState(null, null, window.location.pathname);
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSessionToken(null);
    localStorage.removeItem('fleemy_session_token');
    setCurrentPage('dashboard');
  };

  const checkExistingSession = async () => {
    const token = localStorage.getItem('fleemy_session_token');
    if (token) {
      try {
        const response = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser(response.data);
        setSessionToken(token);
      } catch (error) {
        localStorage.removeItem('fleemy_session_token');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    checkExistingSession();
  }, []);

  const renderCurrentPage = () => {
    const pageProps = { user, sessionToken };
    
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard {...pageProps} />;
      case 'planning':
        return <Planning {...pageProps} />;
      case 'tasks':
        return <Tasks {...pageProps} />;
      case 'todos':
        return <TodoList {...pageProps} />;
      case 'clients':
        return <Clients {...pageProps} />;
      case 'quotes':
        return <Quotes {...pageProps} />;
      case 'invoices':
        return <Invoices {...pageProps} />;
      case 'settings':
        return <Settings {...pageProps} />;
      default:
        return <Dashboard {...pageProps} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-gray-700">Chargement de Fleemy...</div>
          <div className="text-sm text-gray-500 mt-2">Votre outil tout-en-un</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Menu Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`${
        isMobile 
          ? `fixed left-0 top-0 h-full w-64 z-50 transform transition-transform duration-300 ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`
          : 'w-64'
      } flex-shrink-0`}>
        <Sidebar
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          user={user}
          onLogout={handleLogout}
          isMobile={isMobile}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        {isMobile && (
          <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center space-x-2">
              <div className="text-lg">📊</div>
              <h1 className="text-lg font-bold text-gray-800">Fleemy</h1>
            </div>
            <div className="w-10"></div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}

export default App;