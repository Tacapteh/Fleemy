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

// Planning Constants
const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const dayNamesShort = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const eventTypes = {
  paid: { label: "Payé", color: "bg-green-100 border-green-300 text-green-800", bgColor: "#dcfce7" },
  unpaid: { label: "Non payé", color: "bg-red-100 border-red-300 text-red-800", bgColor: "#fee2e2" },
  pending: { label: "En attente", color: "bg-orange-100 border-orange-300 text-orange-800", bgColor: "#fed7aa" },
  not_worked: { label: "Pas travaillé", color: "bg-purple-100 border-purple-300 text-purple-800", bgColor: "#e9d5ff" }
};

// Utility functions for planning
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const getWeekDates = (year, week) => {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  
  const days = [];
  for (let i = 0; i < 5; i++) { // Lundi à Vendredi
    const day = new Date(ISOweekStart);
    day.setDate(ISOweekStart.getDate() + i);
    days.push(day);
  }
  return days;
};

const getMonthDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay();
  
  const days = [];
  
  // Previous month days
  const prevMonth = new Date(year, month - 1, 0);
  for (let i = startDay === 0 ? 6 : startDay - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonth.getDate() - i),
      isCurrentMonth: false
    });
  }
  
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      date: new Date(year, month, i),
      isCurrentMonth: true
    });
  }
  
  // Next month days to fill the grid
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false
    });
  }
  
  return days;
};

// Event Modal Component
const EventModal = ({ isOpen, onClose, onSave, onDelete, event, timeSlot, selectedDate }) => {
  const [formData, setFormData] = useState({
    description: '',
    day: 0,
    start: '09:00',
    end: '10:00',
    type: 'pending'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (event) {
      setFormData({
        description: event.description || '',
        day: event.day || 0,
        start: event.start || '09:00',
        end: event.end || '10:00',
        type: event.type || 'pending'
      });
    } else if (timeSlot) {
      setFormData({
        description: '',
        day: timeSlot.day,
        start: timeSlot.start,
        end: timeSlot.end,
        type: 'pending'
      });
    } else if (selectedDate) {
      const dayOfWeek = selectedDate.getDay();
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      setFormData({
        description: '',
        day: adjustedDay < 5 ? adjustedDay : 0,
        start: '09:00',
        end: '10:00',
        type: 'pending'
      });
    } else {
      setFormData({
        description: '',
        day: 0,
        start: '09:00',
        end: '10:00',
        type: 'pending'
      });
    }
  }, [event, timeSlot, selectedDate, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
      setLoading(true);
      try {
        await onDelete(event.id);
      } catch (error) {
        console.error('Error deleting event:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="modal-header">
          {event ? 'Modifier l\'événement' : 'Nouvel événement'}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Description *</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="form-input"
              required
              disabled={loading}
              placeholder="Description de l'événement"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Jour</label>
            <select
              value={formData.day}
              onChange={(e) => setFormData({...formData, day: parseInt(e.target.value)})}
              className="form-input"
              disabled={loading}
            >
              {dayNames.map((day, index) => (
                <option key={index} value={index}>{day}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Heure de début</label>
              <select
                value={formData.start}
                onChange={(e) => setFormData({...formData, start: e.target.value})}
                className="form-input"
                disabled={loading}
              >
                {timeSlots.slice(0, -1).map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Heure de fin</label>
              <select
                value={formData.end}
                onChange={(e) => setFormData({...formData, end: e.target.value})}
                className="form-input"
                disabled={loading}
              >
                {timeSlots.slice(1).map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              className="form-input"
              disabled={loading}
            >
              {Object.entries(eventTypes).map(([key, type]) => (
                <option key={key} value={key}>{type.label}</option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              disabled={loading}
            >
              Annuler
            </button>
            {event && (
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-danger"
                disabled={loading}
              >
                {loading ? '...' : 'Supprimer'}
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '...' : (event ? 'Modifier' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Day Events Modal Component
const DayEventsModal = ({ isOpen, onClose, events, date, onEventClick, onCreateEvent }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="modal-header">
          📅 {date && formatDate(date)}
        </h2>
        
        <div style={{ marginBottom: '24px' }}>
          {events.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {events.map(event => {
                const eventClass = `event-${event.type === 'paid' ? 'meeting' : 
                                    event.type === 'unpaid' ? 'task' : 
                                    event.type === 'pending' ? 'break' : 'notworked'}`;
                
                return (
                  <div
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className={`${eventClass}`}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      borderLeft: '4px solid',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div className="event-description" style={{ marginBottom: '4px' }}>
                      {event.description}
                    </div>
                    <div className="event-time">
                      {event.start} - {event.end}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#6c757d', padding: '20px 0' }}>
              Aucun événement pour cette journée
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button
            onClick={onClose}
            className="btn btn-outline"
          >
            Fermer
          </button>
          <button
            onClick={() => onCreateEvent(date)}
            className="btn btn-primary"
          >
            + Nouvel événement
          </button>
        </div>
      </div>
    </div>
  );
};

// Offline Storage Class
class PlanningOfflineStorage {
  constructor() {
    this.dbName = 'FleemyPlanningDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('events')) {
          const store = db.createObjectStore('events', { keyPath: 'id' });
          store.createIndex('week_year', ['week', 'year']);
          store.createIndex('uid', 'uid');
        }
      };
    });
  }

  async saveEvent(event) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction(['events'], 'readwrite');
    const store = transaction.objectStore('events');
    await store.put(event);
  }

  async getEvents(uid, year, week) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction(['events'], 'readonly');
    const store = transaction.objectStore('events');
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const events = request.result.filter(e => 
          e.uid === uid && e.year === year && e.week === week
        );
        resolve(events);
      };
    });
  }

  async deleteEvent(eventId) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction(['events'], 'readwrite');
    const store = transaction.objectStore('events');
    await store.delete(eventId);
  }

  async clearWeekEvents(uid, year, week) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction(['events'], 'readwrite');
    const store = transaction.objectStore('events');
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const events = request.result.filter(e => 
          e.uid === uid && e.year === year && e.week === week
        );
        events.forEach(event => store.delete(event.id));
        resolve();
      };
    });
  }
}

// Main Planning Component
const Planning = ({ user, sessionToken }) => {
  const [view, setView] = useState('week'); // 'week' or 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [eventModal, setEventModal] = useState({ isOpen: false, event: null, timeSlot: null, selectedDate: null });
  const [dayEventsModal, setDayEventsModal] = useState({ isOpen: false, events: [], date: null });
  const [team, setTeam] = useState(null);
  const [viewingMember, setViewingMember] = useState(null);
  const [hourlyRate, setHourlyRate] = useState(50);
  const [showRateModal, setShowRateModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineStorage] = useState(new PlanningOfflineStorage());

  const currentYear = currentDate.getFullYear();
  const currentWeek = getWeekNumber(currentDate);
  const currentMonth = currentDate.getMonth();

  useEffect(() => {
    // Initialize offline storage
    offlineStorage.init();
    
    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const apiCall = async (url, options = {}) => {
    try {
      return await axios({
        url: `${API}${url}`,
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
    } catch (error) {
      if (!isOnline) {
        throw new Error('Offline mode');
      }
      throw error;
    }
  };

  const loadEvents = async (smooth = false) => {
    try {
      if (smooth) {
        setTransitioning(true);
        // Small delay to show transition
        await new Promise(resolve => setTimeout(resolve, 150));
      } else {
        setLoading(true);
      }
      
      const targetUid = viewingMember ? viewingMember.uid : user.uid;
      
      if (view === 'week') {
        const response = await apiCall(`/planning/week/${currentYear}/${currentWeek}`);
        setEvents(response.data.events || []);
      } else {
        const response = await apiCall(`/planning/month/${currentYear}/${currentMonth}`);
        setEvents(response.data.events || []);
      }
      
      if (smooth) {
        // Add slight delay for smooth animation
        setTimeout(() => setTransitioning(false), 100);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      if (!isOnline) {
        // Load from offline storage
        const offlineEvents = await offlineStorage.getEvents(user.uid, currentYear, currentWeek);
        setEvents(offlineEvents);
      }
      if (smooth) {
        setTransitioning(false);
      }
    } finally {
      if (!smooth) {
        setLoading(false);
      }
    }
  };

  const loadTeam = async () => {
    try {
      const response = await apiCall('/teams/my');
      setTeam(response.data);
    } catch (error) {
      console.error('Error loading team:', error);
    }
  };

  const loadUserRate = async () => {
    try {
      const response = await apiCall('/auth/me');
      setHourlyRate(response.data.hourly_rate || 50);
    } catch (error) {
      console.error('Error loading user rate:', error);
    }
  };

  useEffect(() => {
    if (!transitioning) {
      loadEvents();
    }
  }, [view, currentYear, currentWeek, currentMonth, viewingMember]);

  useEffect(() => {
    loadTeam();
    loadUserRate();
  }, []);

  const handleCreateEvent = async (eventData) => {
    try {
      const eventToCreate = {
        description: eventData.description,
        client_id: eventData.client_id || '',
        client_name: eventData.client_name || '',
        day: dayNames[eventData.day].toLowerCase(),
        start_time: eventData.start,
        end_time: eventData.end,
        status: eventData.type,
        uid: user.uid,
        week: currentWeek,
        year: currentYear
      };

      // Save to server
      const response = await apiCall('/planning/events', {
        method: 'POST',
        data: eventToCreate
      });

      // Save to offline storage
      await offlineStorage.saveEvent(response.data);

      setEventModal({ isOpen: false, event: null, timeSlot: null, selectedDate: null });
      
      // Smooth reload after event creation
      loadEvents(true);
    } catch (error) {
      console.error('Error creating event:', error);
      // If offline, save locally only
      if (!isOnline) {
        const eventToCreateLocal = {
          ...eventData,
          uid: user.uid,
          week: currentWeek,
          year: currentYear,
          id: Date.now().toString(),
          created_at: new Date().toISOString()
        };
        await offlineStorage.saveEvent(eventToCreateLocal);
        setEventModal({ isOpen: false, event: null, timeSlot: null, selectedDate: null });
        loadEvents(true);
      }
    }
  };

  const handleUpdateEvent = async (eventData) => {
    try {
      await apiCall(`/planning/events/${eventModal.event.id}`, {
        method: 'PUT',
        data: eventData
      });

      setEventModal({ isOpen: false, event: null, timeSlot: null, selectedDate: null });
      loadEvents(true);
    } catch (error) {
      console.error('Error updating event:', error);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await apiCall(`/planning/events/${eventId}`, {
        method: 'DELETE'
      });

      await offlineStorage.deleteEvent(eventId);
      setEventModal({ isOpen: false, event: null, timeSlot: null, selectedDate: null });
      loadEvents(true);
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const handleClearWeek = async () => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer tous les événements de cette semaine ?')) {
      try {
        // Delete all events for current week
        const weekEvents = events.filter(e => e.week === currentWeek && e.year === currentYear);
        await Promise.all(
          weekEvents.map(event => apiCall(`/planning/events/${event.id}`, { method: 'DELETE' }))
        );

        await offlineStorage.clearWeekEvents(user.uid, currentYear, currentWeek);
        loadEvents(true);
      } catch (error) {
        console.error('Error clearing week:', error);
      }
    }
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
    
    // Use smooth loading for better UX
    setTimeout(() => loadEvents(true), 50);
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
    
    // Use smooth loading for better UX
    setTimeout(() => loadEvents(true), 50);
  };

  const calculateRevenue = () => {
    const weekEvents = events.filter(e => e.week === currentWeek && e.year === currentYear);
    const revenue = { paid: 0, unpaid: 0, pending: 0 };

    weekEvents.forEach(event => {
      if ((event.status || event.type) !== 'not_worked') {
        const startTime = event.start_time || event.start || '09:00';
        const endTime = event.end_time || event.end || '10:00';
        const startHour = parseInt(startTime.split(':')[0]);
        const endHour = parseInt(endTime.split(':')[0]);
        const hours = endHour - startHour;
        const amount = hours * hourlyRate;

        const eventType = event.status || event.type;
        switch (eventType) {
          case 'paid':
            revenue.paid += amount;
            break;
          case 'unpaid':
            revenue.unpaid += amount;
            break;
          case 'pending':
            revenue.pending += amount;
            break;
        }
      }
    });

    return revenue;
  };

  const revenue = calculateRevenue();
  const weekDates = getWeekDates(currentYear, currentWeek);

  const getEventsForTimeSlot = (day, time) => {
    return events.filter(event => 
      event.day === day && 
      (event.start_time || event.start) === time &&
      event.week === currentWeek &&
      event.year === currentYear
    );
  };

  const getEventsForDate = (date) => {
    const dayOfWeek = date.getDay();
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    if (adjustedDay >= 5) return []; // Weekend
    
    return events.filter(event => {
      const eventDate = new Date(currentYear, 0, 1);
      eventDate.setDate(eventDate.getDate() + (event.week - 1) * 7 + event.day);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const handleDayClick = (date) => {
    const dayEvents = getEventsForDate(date);
    setDayEventsModal({ isOpen: true, events: dayEvents, date });
  };

  const handleEventClick = (event) => {
    if (!viewingMember) { // Only allow editing own events
      setEventModal({ isOpen: true, event, timeSlot: null, selectedDate: null });
    }
  };

  const handleTimeSlotClick = (day, start) => {
    if (!viewingMember) {
      const endIndex = timeSlots.indexOf(start) + 1;
      const end = endIndex < timeSlots.length ? timeSlots[endIndex] : '18:00';
      setEventModal({ 
        isOpen: true, 
        event: null, 
        timeSlot: { day, start, end }, 
        selectedDate: null 
      });
    }
  };

  const handleCreateFromDay = (date) => {
    setDayEventsModal({ isOpen: false, events: [], date: null });
    setEventModal({ isOpen: true, event: null, timeSlot: null, selectedDate: date });
  };

  const updateHourlyRate = async (newRate) => {
    try {
      await apiCall('/auth/me', {
        method: 'PUT',
        data: { hourly_rate: newRate }
      });
      setHourlyRate(newRate);
      setShowRateModal(false);
    } catch (error) {
      console.error('Error updating hourly rate:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du planning...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Planning Header */}
      <div className="planning-header">
        <div className="flex items-center space-x-4">
          <h1 className="planning-title">📅 Planning</h1>
          
          {/* Online/Offline indicator */}
          <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
            <span>{isOnline ? '🟢' : '🔴'}</span>
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </div>
        </div>

        <div className="planning-nav">
          {/* Team member selector */}
          {team && (
            <select
              value={viewingMember ? viewingMember.uid : 'own'}
              onChange={(e) => {
                if (e.target.value === 'own') {
                  setViewingMember(null);
                } else {
                  const member = team.members.find(m => m.uid === e.target.value);
                  setViewingMember(member);
                }
              }}
              className="form-input"
              style={{ width: 'auto', minWidth: '200px' }}
            >
              <option value="own">Mon planning</option>
              {team.members.filter(m => m.uid !== user.uid).map(member => (
                <option key={member.uid} value={member.uid}>
                  {member.name} (lecture seule)
                </option>
              ))}
            </select>
          )}

          {/* View toggle */}
          <button
            onClick={() => setView('week')}
            className={view === 'week' ? 'active' : ''}
          >
            Semaine
          </button>
          <button
            onClick={() => setView('month')}
            className={view === 'month' ? 'active' : ''}
          >
            Mois
          </button>

          {/* Actions */}
          {!viewingMember && (
            <>
              <button
                onClick={() => setShowRateModal(true)}
                className="btn btn-outline"
              >
                {hourlyRate}€/h
              </button>
              
              {view === 'week' && (
                <button
                  onClick={handleClearWeek}
                  className="btn btn-danger"
                >
                  Vider semaine
                </button>
              )}
              
              <button
                onClick={() => setEventModal({ isOpen: true, event: null, timeSlot: null, selectedDate: null })}
                className="btn btn-primary"
              >
                + Événement
              </button>
            </>
          )}
        </div>
      </div>

      {/* Week Navigation */}
      <div className="week-navigation">
        <button
          onClick={() => view === 'week' ? navigateWeek(-1) : navigateMonth(-1)}
          className="week-nav-btn"
          disabled={transitioning}
        >
          ◀
        </button>
        
        <h2 className={`week-title ${transitioning ? 'updating' : ''}`}>
          {view === 'week' 
            ? `Semaine ${currentWeek} - ${monthNames[weekDates[0].getMonth()]} ${currentYear}`
            : `${monthNames[currentMonth]} ${currentYear}`
          }
        </h2>
        
        <button
          onClick={() => view === 'week' ? navigateWeek(1) : navigateMonth(1)}
          className="week-nav-btn"
          disabled={transitioning}
        >
          ▶
        </button>
      </div>

      {/* Revenue Summary - Only show for personal view */}
      {view === 'week' && !viewingMember && (
        <div className="revenue-cards">
          <div className="revenue-card paid">
            <div className="revenue-amount">{formatCurrency(revenue.paid)}</div>
            <div className="revenue-label">Revenus payés</div>
          </div>
          <div className="revenue-card unpaid">
            <div className="revenue-amount">{formatCurrency(revenue.unpaid)}</div>
            <div className="revenue-label">Revenus impayés</div>
          </div>
          <div className="revenue-card pending">
            <div className="revenue-amount">{formatCurrency(revenue.pending)}</div>
            <div className="revenue-label">Revenus en attente</div>
          </div>
        </div>
      )}

      {/* Planning Table */}
      {view === 'week' ? (
        <div className={`planning-content ${transitioning ? 'transitioning' : ''}`}>
          <div className="planning-container">
            <table className="planning-table">
              <thead>
                <tr>
                  <th className="time-header">Heure</th>
                  {weekDates.map((date, index) => (
                    <th key={index} className="day-header">
                      {dayNames[index]}
                      <div className="day-date">
                        {date.getDate()}/{date.getMonth() + 1}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.slice(0, -1).map((time, timeIndex) => (
                  <tr key={time}>
                    <td className="time-header">{time}</td>
                    {dayNames.map((dayName, dayIndex) => {
                      const slotEvents = getEventsForTimeSlot(dayIndex, time);
                      
                      return (
                        <td
                          key={dayIndex}
                          onClick={() => handleTimeSlotClick(dayIndex, time)}
                          style={{ cursor: viewingMember ? 'default' : 'pointer' }}
                        >
                          {slotEvents.map(event => (
                            <div
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(event);
                              }}
                              className={`event ${
                                (event.status || event.type) === 'paid' ? 'event-meeting' : 
                                (event.status || event.type) === 'unpaid' ? 'event-task' : 
                                (event.status || event.type) === 'pending' ? 'event-break' : 
                                'event-notworked'
                              } ${transitioning ? '' : 'new-event'}`}
                            >
                              <div className="event-description">{event.description}</div>
                              <div className="event-time">
                                {(event.start_time || event.start)} - {(event.end_time || event.end)}
                              </div>
                              {event.client_name && (
                                <div className="event-client">{event.client_name}</div>
                              )}
                            </div>
                          ))}
                          
                          {/* Loading skeleton during transition */}
                          {transitioning && (
                            <div className="planning-skeleton" style={{
                              width: '100%',
                              height: '20px',
                              borderRadius: '4px',
                              marginTop: '4px'
                            }}></div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Month View - Using same style as before but with original styling */
        <div className="planning-container">
          <table className="planning-table">
            <thead>
              <tr>
                {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
                  <th key={day} className="day-header">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getMonthDays(currentYear, currentMonth).reduce((rows, day, index) => {
                if (index % 7 === 0) rows.push([]);
                rows[rows.length - 1].push(day);
                return rows;
              }, []).map((week, weekIndex) => (
                <tr key={weekIndex}>
                  {week.map((day, dayIndex) => {
                    const dayEvents = getEventsForDate(day.date);
                    const visibleEvents = dayEvents.slice(0, 2);
                    const remainingCount = dayEvents.length - visibleEvents.length;
                    const isToday = day.date.toDateString() === new Date().toDateString();

                    return (
                      <td
                        key={dayIndex}
                        onClick={() => handleDayClick(day.date)}
                        style={{
                          backgroundColor: !day.isCurrentMonth ? '#f8f9fa' : 
                                          isToday ? '#e3f2fd' : '#fff',
                          color: !day.isCurrentMonth ? '#6c757d' : '#212529',
                          height: '100px',
                          verticalAlign: 'top',
                          padding: '8px'
                        }}
                      >
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                          {day.date.getDate()}
                        </div>
                        
                        <div style={{ fontSize: '11px' }}>
                          {visibleEvents.map(event => {
                            const eventClass = `event-${event.type === 'paid' ? 'meeting' : 
                                                event.type === 'unpaid' ? 'task' : 
                                                event.type === 'pending' ? 'break' : 'notworked'}`;
                            
                            return (
                              <div
                                key={event.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEventClick(event);
                                }}
                                className={`${eventClass}`}
                                style={{
                                  padding: '2px 4px',
                                  marginBottom: '2px',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  borderLeft: '3px solid',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {event.description}
                              </div>
                            );
                          })}
                          {remainingCount > 0 && (
                            <div style={{ 
                              fontSize: '10px', 
                              color: '#007bff', 
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}>
                              +{remainingCount} autres
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <EventModal
        isOpen={eventModal.isOpen}
        onClose={() => setEventModal({ isOpen: false, event: null, timeSlot: null, selectedDate: null })}
        onSave={eventModal.event ? handleUpdateEvent : handleCreateEvent}
        onDelete={handleDeleteEvent}
        event={eventModal.event}
        timeSlot={eventModal.timeSlot}
        selectedDate={eventModal.selectedDate}
      />

      <DayEventsModal
        isOpen={dayEventsModal.isOpen}
        onClose={() => setDayEventsModal({ isOpen: false, events: [], date: null })}
        events={dayEventsModal.events}
        date={dayEventsModal.date}
        onEventClick={handleEventClick}
        onCreateEvent={handleCreateFromDay}
      />

      {/* Hourly Rate Modal */}
      {showRateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-header">Modifier le taux horaire</h2>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const newRate = parseFloat(formData.get('rate'));
              if (newRate > 0) {
                updateHourlyRate(newRate);
              }
            }}>
              <div className="form-group">
                <label className="form-label">Taux horaire (€)</label>
                <input
                  type="number"
                  name="rate"
                  defaultValue={hourlyRate}
                  step="0.01"
                  min="0"
                  className="form-input"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="btn btn-outline"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Modifier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

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