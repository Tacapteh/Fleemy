import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Utility functions
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR');
};

const formatDateTime = (date) => {
  return new Date(date).toLocaleString('fr-FR');
};

const isOverdue = (date) => {
  return new Date(date) < new Date().setHours(0, 0, 0, 0);
};

const isToday = (date) => {
  const today = new Date();
  const taskDate = new Date(date);
  return taskDate.toDateString() === today.toDateString();
};

const isDueSoon = (date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const taskDate = new Date(date);
  return taskDate.toDateString() === tomorrow.toDateString();
};

// Task categories and priorities
const categories = [
  { id: 'work', name: 'Travail', color: '#3B82F6', icon: '💼' },
  { id: 'personal', name: 'Personnel', color: '#10B981', icon: '🏠' },
  { id: 'urgent', name: 'Urgent', color: '#EF4444', icon: '🚨' },
  { id: 'health', name: 'Santé', color: '#F59E0B', icon: '🏥' },
  { id: 'learning', name: 'Apprentissage', color: '#8B5CF6', icon: '📚' },
  { id: 'shopping', name: 'Courses', color: '#EC4899', icon: '🛒' },
  { id: 'other', name: 'Autre', color: '#6B7280', icon: '📋' }
];

const priorities = [
  { id: 'low', name: 'Faible', color: '#10B981' },
  { id: 'medium', name: 'Moyenne', color: '#F59E0B' },
  { id: 'high', name: 'Élevée', color: '#EF4444' }
];

// Local Storage functions
const saveTasksToLocal = (tasks) => {
  localStorage.setItem('fleemy_tasks', JSON.stringify(tasks));
};

const loadTasksFromLocal = () => {
  const saved = localStorage.getItem('fleemy_tasks');
  return saved ? JSON.parse(saved) : [];
};

const saveUserToLocal = (user) => {
  localStorage.setItem('fleemy_user', JSON.stringify(user));
};

const loadUserFromLocal = () => {
  const saved = localStorage.getItem('fleemy_user');
  return saved ? JSON.parse(saved) : null;
};

// Home Page Component
const HomePage = ({ onNavigate, user, onLogout }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="text-3xl">📅</div>
            <h1 className="text-2xl font-bold text-gray-800">Fleemy</h1>
          </div>
          {user ? (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Bonjour, {user.name}</span>
              <button
                onClick={onLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Se déconnecter
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Mode invité</div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="mb-8">
          <div className="text-8xl mb-6">📅</div>
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            Fleemy
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Votre assistant personnel de gestion des tâches
          </p>
          <p className="text-lg text-gray-500">
            Organisez, planifiez et suivez vos tâches en toute simplicité
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="text-3xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Gestion complète</h3>
            <p className="text-gray-600">Créez, modifiez et suivez vos tâches avec facilité</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="text-3xl mb-4">📊</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Organisation avancée</h3>
            <p className="text-gray-600">Catégories, priorités et filtres pour tout organiser</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="text-3xl mb-4">📱</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Accès universel</h3>
            <p className="text-gray-600">Disponible partout, même en mode invité</p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => onNavigate('planning')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            🚀 Commencer maintenant
          </button>
          {!user && (
            <button
              onClick={() => onNavigate('auth')}
              className="bg-white hover:bg-gray-50 text-gray-700 font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-200 border border-gray-300 shadow-lg"
            >
              🔐 Se connecter
            </button>
          )}
        </div>

        {!user && (
          <p className="text-sm text-gray-500 mt-4">
            Ou continuez en mode invité sans inscription
          </p>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-100 py-8 mt-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="text-2xl">📅</div>
            <span className="text-lg font-semibold text-gray-700">Fleemy</span>
          </div>
          <p className="text-gray-600">
            Votre productivité, notre priorité
          </p>
        </div>
      </footer>
    </div>
  );
};

// Authentication Component
const AuthPage = ({ onNavigate, onLogin }) => {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleLocalAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Simulate local authentication
      const user = {
        id: Date.now(),
        name: mode === 'register' ? formData.name : formData.email.split('@')[0],
        email: formData.email,
        type: 'local'
      };
      
      saveUserToLocal(user);
      onLogin(user);
      onNavigate('planning');
    } catch (error) {
      console.error('Auth error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for session_id in URL fragment (Emergent auth)
    const hash = window.location.hash;
    if (hash.includes('session_id=')) {
      const sessionId = hash.split('session_id=')[1].split('&')[0];
      
      // Handle Emergent auth (simplified)
      const emergentUser = {
        id: sessionId,
        name: 'Utilisateur Emergent',
        email: 'user@emergent.com',
        type: 'emergent'
      };
      
      saveUserToLocal(emergentUser);
      onLogin(emergentUser);
      onNavigate('planning');
      
      // Clear hash
      window.history.replaceState(null, null, window.location.pathname);
    }
  }, [onLogin, onNavigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">📅</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {mode === 'login' ? 'Connexion' : 'Inscription'}
          </h1>
          <p className="text-gray-600">
            Accédez à votre espace Fleemy
          </p>
        </div>

        {/* Auth Methods */}
        <div className="space-y-4 mb-6">
          {/* Google/Emergent Auth */}
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
          >
            <span>🌐</span>
            <span>Connexion Emergent</span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">ou</span>
            </div>
          </div>

          {/* Local Auth Form */}
          <form onSubmit={handleLocalAuth} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
              disabled={loading}
            >
              {loading ? '...' : (mode === 'login' ? 'Se connecter' : 'S\'inscrire')}
            </button>
          </form>
        </div>

        {/* Switch Mode */}
        <div className="text-center">
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {mode === 'login' 
              ? 'Pas encore de compte ? S\'inscrire' 
              : 'Déjà un compte ? Se connecter'
            }
          </button>
        </div>

        {/* Guest Mode */}
        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <button
            onClick={() => onNavigate('planning')}
            className="text-gray-600 hover:text-gray-800 text-sm underline"
          >
            Continuer en mode invité
          </button>
        </div>

        {/* Back to Home */}
        <div className="mt-4 text-center">
          <button
            onClick={() => onNavigate('home')}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
};

// Task Form Modal
const TaskModal = ({ isOpen, onClose, onSave, task = null }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    category: 'other',
    priority: 'medium',
    completed: false
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        dueDate: task.dueDate || '',
        category: task.category || 'other',
        priority: task.priority || 'medium',
        completed: task.completed || false
      });
    } else {
      // Default due date to today
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      setFormData({
        title: '',
        description: '',
        dueDate: todayString,
        category: 'other',
        priority: 'medium',
        completed: false
      });
    }
  }, [task, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      id: task?.id || Date.now(),
      createdAt: task?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-96 overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            {task ? 'Modifier la tâche' : 'Nouvelle tâche'}
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
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                placeholder="Titre de la tâche"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="3"
                placeholder="Description optionnelle"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date d'échéance *
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Catégorie
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priorité
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({...formData, priority: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {priorities.map(priority => (
                    <option key={priority.id} value={priority.id}>
                      {priority.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {task && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="completed"
                  checked={formData.completed}
                  onChange={(e) => setFormData({...formData, completed: e.target.checked})}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor="completed" className="ml-2 text-sm text-gray-700">
                  Marquer comme terminée
                </label>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-all"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-all"
              >
                {task ? 'Modifier' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Calendar View Component
const CalendarView = ({ tasks, onTaskClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();
    
    const days = [];
    
    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      const day = new Date(year, month, -i);
      days.push({ date: day, isCurrentMonth: false });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(year, month, i);
      days.push({ date: day, isCurrentMonth: true });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const day = new Date(year, month + 1, i);
      days.push({ date: day, isCurrentMonth: false });
    }
    
    return days;
  };

  const getTasksForDate = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return tasks.filter(task => task.dueDate === dateString);
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const days = getDaysInMonth(currentDate);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Calendar Header */}
      <div className="bg-gray-50 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-all"
          >
            ←
          </button>
          
          <h2 className="text-xl font-semibold text-gray-800">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-all"
          >
            →
          </button>
        </div>
      </div>

      {/* Days of week */}
      <div className="grid grid-cols-7 bg-gray-50 border-b">
        {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
          <div key={day} className="p-3 text-center text-sm font-medium text-gray-600">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayTasks = getTasksForDate(day.date);
          const isToday = day.date.toDateString() === new Date().toDateString();
          
          return (
            <div
              key={index}
              className={`min-h-24 p-2 border-b border-r cursor-pointer hover:bg-gray-50 transition-all ${
                !day.isCurrentMonth ? 'bg-gray-100 text-gray-400' : ''
              } ${isToday ? 'bg-blue-50 border-blue-200' : ''}`}
            >
              <div className={`text-sm font-medium mb-1 ${
                isToday ? 'text-blue-600' : day.isCurrentMonth ? 'text-gray-800' : 'text-gray-400'
              }`}>
                {day.date.getDate()}
              </div>
              
              <div className="space-y-1">
                {dayTasks.slice(0, 2).map(task => {
                  const category = categories.find(c => c.id === task.category);
                  return (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: category?.color + '20', color: category?.color }}
                    >
                      {task.completed ? '✅' : ''} {task.title}
                    </div>
                  );
                })}
                {dayTasks.length > 2 && (
                  <div className="text-xs text-gray-500 font-medium">
                    +{dayTasks.length - 2} autres
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Planning Page Component
const PlanningPage = ({ onNavigate, user, onLogout }) => {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [taskModal, setTaskModal] = useState({ isOpen: false, task: null });
  const [view, setView] = useState('list'); // 'list' or 'calendar'
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    priority: 'all',
    status: 'all', // 'all', 'completed', 'pending'
    sortBy: 'dueDate' // 'dueDate', 'priority', 'created', 'title'
  });

  // Load tasks from localStorage on component mount
  useEffect(() => {
    const savedTasks = loadTasksFromLocal();
    setTasks(savedTasks);
  }, []);

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    saveTasksToLocal(tasks);
  }, [tasks]);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...tasks];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchLower) ||
        task.description.toLowerCase().includes(searchLower)
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(task => task.category === filters.category);
    }

    // Priority filter
    if (filters.priority !== 'all') {
      filtered = filtered.filter(task => task.priority === filters.priority);
    }

    // Status filter
    if (filters.status !== 'all') {
      if (filters.status === 'completed') {
        filtered = filtered.filter(task => task.completed);
      } else if (filters.status === 'pending') {
        filtered = filtered.filter(task => !task.completed);
      }
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'dueDate':
          return new Date(a.dueDate) - new Date(b.dueDate);
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'created':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    setFilteredTasks(filtered);
  }, [tasks, filters]);

  const handleCreateTask = (taskData) => {
    setTasks([...tasks, taskData]);
    setTaskModal({ isOpen: false, task: null });
  };

  const handleUpdateTask = (taskData) => {
    setTasks(tasks.map(task => task.id === taskData.id ? taskData : task));
    setTaskModal({ isOpen: false, task: null });
  };

  const handleDeleteTask = (taskId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
      setTasks(tasks.filter(task => task.id !== taskId));
    }
  };

  const handleToggleComplete = (taskId) => {
    setTasks(tasks.map(task => 
      task.id === taskId 
        ? { ...task, completed: !task.completed, updatedAt: new Date().toISOString() }
        : task
    ));
  };

  const handleTaskClick = (task) => {
    setTaskModal({ isOpen: true, task });
  };

  const getTaskStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const overdue = tasks.filter(t => !t.completed && isOverdue(t.dueDate)).length;
    const today = tasks.filter(t => !t.completed && isToday(t.dueDate)).length;
    
    return { total, completed, overdue, today };
  };

  const stats = getTaskStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => onNavigate('home')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
              >
                <div className="text-2xl">📅</div>
                <h1 className="text-xl font-bold text-gray-800">Fleemy</h1>
              </button>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setView('list')}
                  className={`px-3 py-1 rounded-lg text-sm transition-all ${
                    view === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  📋 Liste
                </button>
                <button
                  onClick={() => setView('calendar')}
                  className={`px-3 py-1 rounded-lg text-sm transition-all ${
                    view === 'calendar' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  📅 Calendrier
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {user ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600">
                    {user.name} {user.type === 'local' ? '(Local)' : '(Emergent)'}
                  </span>
                  <button
                    onClick={onLogout}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Déconnexion
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-500">Mode invité</span>
                  <button
                    onClick={() => onNavigate('auth')}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Se connecter
                  </button>
                </div>
              )}
              
              <button
                onClick={() => setTaskModal({ isOpen: true, task: null })}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all"
              >
                ➕ Nouvelle tâche
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-sm text-gray-600">Total des tâches</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-gray-600">Terminées</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="text-2xl font-bold text-blue-600">{stats.today}</div>
            <div className="text-sm text-gray-600">Aujourd'hui</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <div className="text-sm text-gray-600">En retard</div>
          </div>
        </div>

        {/* Filters - Only show in list view */}
        {view === 'list' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border mb-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* Search */}
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="Rechercher une tâche..."
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Category Filter */}
              <div>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({...filters, category: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Toutes catégories</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority Filter */}
              <div>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters({...filters, priority: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Toutes priorités</option>
                  {priorities.map(priority => (
                    <option key={priority.id} value={priority.id}>{priority.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Tous statuts</option>
                  <option value="pending">En cours</option>
                  <option value="completed">Terminées</option>
                </select>
              </div>

              {/* Sort */}
              <div>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({...filters, sortBy: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="dueDate">Par échéance</option>
                  <option value="priority">Par priorité</option>
                  <option value="created">Par création</option>
                  <option value="title">Par titre</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {view === 'list' ? (
          /* List View */
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {filteredTasks.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Aucune tâche trouvée
                </h3>
                <p className="text-gray-500 mb-6">
                  {tasks.length === 0 
                    ? 'Commencez par créer votre première tâche !' 
                    : 'Essayez de modifier vos filtres de recherche.'
                  }
                </p>
                <button
                  onClick={() => setTaskModal({ isOpen: true, task: null })}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-all"
                >
                  ➕ Créer une tâche
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredTasks.map(task => {
                  const category = categories.find(c => c.id === task.category);
                  const priority = priorities.find(p => p.id === task.priority);
                  const taskIsOverdue = isOverdue(task.dueDate) && !task.completed;
                  const taskIsToday = isToday(task.dueDate);
                  const taskIsDueSoon = isDueSoon(task.dueDate);
                  
                  return (
                    <div
                      key={task.id}
                      className={`p-4 hover:bg-gray-50 transition-all cursor-pointer ${
                        task.completed ? 'opacity-60' : ''
                      } ${taskIsOverdue ? 'bg-red-50 border-l-4 border-red-500' : ''} ${
                        taskIsToday ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      } ${taskIsDueSoon ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''}`}
                      onClick={() => handleTaskClick(task)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleComplete(task.id);
                              }}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                task.completed 
                                  ? 'bg-green-500 border-green-500 text-white' 
                                  : 'border-gray-300 hover:border-green-500'
                              }`}
                            >
                              {task.completed && '✓'}
                            </button>
                            
                            <h3 className={`font-semibold ${
                              task.completed ? 'line-through text-gray-500' : 'text-gray-800'
                            }`}>
                              {task.title}
                            </h3>
                            
                            <div className="flex items-center space-x-2">
                              <span 
                                className="px-2 py-1 rounded-full text-xs font-medium"
                                style={{ 
                                  backgroundColor: category?.color + '20', 
                                  color: category?.color 
                                }}
                              >
                                {category?.icon} {category?.name}
                              </span>
                              
                              <span 
                                className="px-2 py-1 rounded-full text-xs font-medium"
                                style={{ 
                                  backgroundColor: priority?.color + '20', 
                                  color: priority?.color 
                                }}
                              >
                                {priority?.name}
                              </span>
                            </div>
                          </div>
                          
                          {task.description && (
                            <p className="text-gray-600 text-sm mb-2 ml-8">
                              {task.description}
                            </p>
                          )}
                          
                          <div className="flex items-center space-x-4 text-xs text-gray-500 ml-8">
                            <span className={`${
                              taskIsOverdue ? 'text-red-600 font-medium' : 
                              taskIsToday ? 'text-blue-600 font-medium' :
                              taskIsDueSoon ? 'text-yellow-600 font-medium' : ''
                            }`}>
                              📅 {formatDate(task.dueDate)}
                              {taskIsOverdue && ' (En retard)'}
                              {taskIsToday && ' (Aujourd\'hui)'}
                              {taskIsDueSoon && ' (Demain)'}
                            </span>
                            <span>
                              🕒 Créée le {formatDateTime(task.createdAt)}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskModal({ isOpen: true, task });
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Calendar View */
          <CalendarView
            tasks={tasks}
            onTaskClick={handleTaskClick}
          />
        )}
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={taskModal.isOpen}
        onClose={() => setTaskModal({ isOpen: false, task: null })}
        onSave={taskModal.task ? handleUpdateTask : handleCreateTask}
        task={taskModal.task}
      />
    </div>
  );
};

// Main App Component
function App() {
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'auth', 'planning'
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Load user from localStorage on app start
    const savedUser = loadUserFromLocal();
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    saveUserToLocal(userData);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('fleemy_user');
    setCurrentPage('home');
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="App">
      {currentPage === 'home' && (
        <HomePage 
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
        />
      )}
      
      {currentPage === 'auth' && (
        <AuthPage 
          onNavigate={handleNavigate}
          onLogin={handleLogin}
        />
      )}
      
      {currentPage === 'planning' && (
        <PlanningPage 
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;