import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Utility functions
const getCurrentWeek = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000;
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.ceil((day + start.getDay() + 1) / 7);
};

const getWeekDays = (year, week) => {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  
  const days = [];
  for (let i = 0; i < 5; i++) { // Lundi à Vendredi seulement
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
  for (let i = startDay - 1; i >= 0; i--) {
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

const timeSlots = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const fullDayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const statusColors = {
  paid: "bg-green-100 border-green-400 text-green-800",
  unpaid: "bg-red-100 border-red-400 text-red-800",
  pending: "bg-yellow-100 border-yellow-400 text-yellow-800",
  not_worked: "bg-gray-100 border-gray-400 text-gray-600"
};

const statusLabels = {
  paid: "Payé",
  unpaid: "Non payé", 
  pending: "En attente",
  not_worked: "Pas travaillé"
};

const pastelloColors = [
  "#FFE5E5", "#E5F3FF", "#E5FFE5", "#FFF3E5", "#FFE5F3",
  "#F3E5FF", "#E5FFFF", "#FFFFE5", "#F0F0F0", "#E5E5FF",
  "#FFE5CC", "#CCE5FF", "#E5FFCC", "#FFCCCC", "#CCCCFF"
];

// 50 icônes par catégories
const iconCategories = {
  "Travail": ["💼", "📊", "📈", "📉", "💻", "⌨️", "🖥️", "📱", "📞", "☎️"],
  "Documents": ["📝", "📋", "📄", "📑", "📊", "📈", "📉", "🗂️", "📁", "🗃️"],
  "Communication": ["📧", "💬", "📞", "☎️", "📱", "📲", "💌", "📩", "📨", "📮"],
  "Outils": ["🔧", "⚙️", "🔨", "🪛", "⚡", "🔋", "🔌", "💡", "🔍", "🔎"],
  "Général": ["⭐", "🎯", "🚀", "💰", "💎", "🎨", "🎵", "🎪", "🎭", "🏆"]
};

const allIcons = Object.values(iconCategories).flat();

// IndexedDB pour le mode offline
class OfflineStorage {
  constructor() {
    this.dbName = 'FleemyDB';
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
        
        // Create stores
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('clients')) {
          db.createObjectStore('clients', { keyPath: 'name' });
        }
      };
    });
  }

  async saveEvent(event) {
    const transaction = this.db.transaction(['events'], 'readwrite');
    const store = transaction.objectStore('events');
    await store.put(event);
  }

  async saveTask(task) {
    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    await store.put(task);
  }

  async getEvents(year, week) {
    const transaction = this.db.transaction(['events'], 'readonly');
    const store = transaction.objectStore('events');
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const events = request.result.filter(e => e.year === year && e.week === week);
        resolve(events);
      };
    });
  }

  async getTasks(year, week) {
    const transaction = this.db.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const tasks = request.result.filter(t => t.year === year && t.week === week);
        resolve(tasks);
      };
    });
  }
}

// Authentication component
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
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
        <div className="text-6xl mb-6">📅</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Fleemy</h1>
        <p className="text-gray-600 mb-8">Votre outil complet de gestion de planning et tâches</p>
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

// Icon Selection Modal
const IconModal = ({ isOpen, onClose, onSelect, selectedIcon }) => {
  const [activeCategory, setActiveCategory] = useState("Travail");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Choisir une icône</h2>
        
        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(iconCategories).map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1 rounded-lg text-sm transition-all ${
                activeCategory === category 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
        
        {/* Icons Grid */}
        <div className="grid grid-cols-10 gap-2 mb-6">
          {iconCategories[activeCategory].map(icon => (
            <button
              key={icon}
              onClick={() => onSelect(icon)}
              className={`p-3 rounded-lg border text-xl hover:bg-gray-50 transition-all ${
                selectedIcon === icon ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

// Event Modal
const EventModal = ({ isOpen, onClose, onSave, onDelete, event = null, clients = [] }) => {
  const [formData, setFormData] = useState({
    description: "",
    client: "",
    day: "monday",
    start_time: "09:00",
    end_time: "10:00",
    status: "pending",
    hourly_rate: 50
  });
  const [filteredClients, setFilteredClients] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (event && event.id) {
      setFormData({
        description: event.description || "",
        client: event.client || "",
        day: event.day || "monday",
        start_time: event.start_time || "09:00",
        end_time: event.end_time || "10:00",
        status: event.status || "pending",
        hourly_rate: event.hourly_rate || 50
      });
    } else if (event) {
      // New event with pre-filled data (from time slot click)
      setFormData({
        description: "",
        client: "",
        day: event.day || "monday",
        start_time: event.start_time || "09:00",
        end_time: event.end_time || "10:00",
        status: "pending",
        hourly_rate: 50
      });
    } else {
      setFormData({
        description: "",
        client: "",
        day: "monday",
        start_time: "09:00",
        end_time: "10:00",
        status: "pending",
        hourly_rate: 50
      });
    }
  }, [event, isOpen]);

  const handleClientChange = (value) => {
    setFormData({...formData, client: value});
    
    if (value.length > 0) {
      const filtered = clients.filter(client => 
        client.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredClients(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectClient = (client) => {
    setFormData({...formData, client});
    setShowSuggestions(false);
  };

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
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet événement ?")) {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">
          {event && event.id ? "Modifier l'événement" : "Nouvel événement"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>
          
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <input
              type="text"
              value={formData.client}
              onChange={(e) => handleClientChange(e.target.value)}
              onFocus={() => formData.client && setShowSuggestions(filteredClients.length > 0)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
            />
            {showSuggestions && (
              <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-32 overflow-y-auto shadow-lg">
                {filteredClients.map((client, index) => (
                  <div
                    key={index}
                    onClick={() => selectClient(client)}
                    className="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                  >
                    {client}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jour</label>
            <select
              value={formData.day}
              onChange={(e) => setFormData({...formData, day: e.target.value})}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              {dayKeys.map((key, index) => (
                <option key={key} value={key}>{dayNames[index]}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Début</label>
              <select
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              >
                {timeSlots.slice(0, -1).map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
              <select
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              >
                {timeSlots.slice(1).map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              >
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taux horaire (€)</label>
              <input
                type="number"
                value={formData.hourly_rate}
                onChange={(e) => setFormData({...formData, hourly_rate: parseFloat(e.target.value) || 0})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="0.01"
                disabled={loading}
              />
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
              disabled={loading}
            >
              Annuler
            </button>
            {event && event.id && (
              <button
                type="button"
                onClick={handleDelete}
                className="py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "..." : "Supprimer"}
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "..." : (event && event.id ? "Modifier" : "Créer")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Task Modal
const TaskModal = ({ isOpen, onClose, onSave, onDelete, task = null }) => {
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    color: pastelloColors[0],
    icon: allIcons[0],
    time_slots: []
  });
  const [iconModalOpen, setIconModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task && task.id) {
      setFormData({
        name: task.name || "",
        price: task.price || 0,
        color: task.color || pastelloColors[0],
        icon: task.icon || allIcons[0],
        time_slots: task.time_slots || []
      });
    } else {
      setFormData({
        name: "",
        price: 0,
        color: pastelloColors[0],
        icon: allIcons[0],
        time_slots: []
      });
    }
  }, [task, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleIconSelect = (icon) => {
    setFormData({...formData, icon});
    setIconModalOpen(false);
  };

  const addTimeSlot = () => {
    const newSlot = { day: "monday", start: "09:00", end: "10:00" };
    setFormData({
      ...formData,
      time_slots: [...formData.time_slots, newSlot]
    });
  };

  const removeTimeSlot = (index) => {
    const newSlots = formData.time_slots.filter((_, i) => i !== index);
    setFormData({...formData, time_slots: newSlots});
  };

  const updateTimeSlot = (index, field, value) => {
    const newSlots = [...formData.time_slots];
    newSlots[index][field] = value;
    setFormData({...formData, time_slots: newSlots});
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-96 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">
            {task && task.id ? "Modifier la tâche" : "Nouvelle tâche hebdomadaire"}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix (€)</label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                min="0"
                step="0.01"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
              <div className="flex flex-wrap gap-2">
                {pastelloColors.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({...formData, color})}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === color ? 'border-gray-800 scale-110' : 'border-gray-300 hover:border-gray-500'
                    }`}
                    style={{ backgroundColor: color }}
                    disabled={loading}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icône</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIconModalOpen(true)}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-2xl transition-all"
                  disabled={loading}
                >
                  {formData.icon}
                </button>
                <span className="text-sm text-gray-600">Cliquer pour changer</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Créneaux horaires</label>
              <div className="space-y-2">
                {formData.time_slots.map((slot, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select
                      value={slot.day}
                      onChange={(e) => updateTimeSlot(index, 'day', e.target.value)}
                      className="flex-1 p-1 border border-gray-300 rounded text-sm"
                      disabled={loading}
                    >
                      {dayKeys.map((key, idx) => (
                        <option key={key} value={key}>{dayNames[idx]}</option>
                      ))}
                    </select>
                    <select
                      value={slot.start}
                      onChange={(e) => updateTimeSlot(index, 'start', e.target.value)}
                      className="flex-1 p-1 border border-gray-300 rounded text-sm"
                      disabled={loading}
                    >
                      {timeSlots.slice(0, -1).map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                    <select
                      value={slot.end}
                      onChange={(e) => updateTimeSlot(index, 'end', e.target.value)}
                      className="flex-1 p-1 border border-gray-300 rounded text-sm"
                      disabled={loading}
                    >
                      {timeSlots.slice(1).map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeTimeSlot(index)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      disabled={loading}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTimeSlot}
                  className="w-full p-2 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-all"
                  disabled={loading}
                >
                  + Ajouter un créneau
                </button>
              </div>
            </div>
            
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                disabled={loading}
              >
                Annuler
              </button>
              {task && task.id && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(task.id)}
                  className="py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50"
                  disabled={loading}
                >
                  Supprimer
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "..." : (task && task.id ? "Modifier" : "Créer")}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <IconModal
        isOpen={iconModalOpen}
        onClose={() => setIconModalOpen(false)}
        onSelect={handleIconSelect}
        selectedIcon={formData.icon}
      />
    </>
  );
};

// Team Modal
const TeamModal = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState('join'); // 'create' or 'join'
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // TODO: Implement team creation
      console.log('Creating team:', teamName);
      onClose();
    } catch (error) {
      console.error('Error creating team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // TODO: Implement team joining
      console.log('Joining team with code:', inviteCode);
      onClose();
    } catch (error) {
      console.error('Error joining team:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Équipe</h2>
        
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 px-4 rounded-lg transition-all ${
              mode === 'join' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Rejoindre
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 px-4 rounded-lg transition-all ${
              mode === 'create' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Créer
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l'équipe
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              />
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "..." : "Créer"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoinTeam} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code d'invitation
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: AB12CD34"
                required
                disabled={loading}
              />
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "..." : "Rejoindre"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// Month View Component
const MonthView = ({ year, month, events, tasks, onDayClick, onEventClick }) => {
  const monthDays = getMonthDays(year, month);
  
  const getEventsForDate = (date) => {
    const dayKey = dayKeys[date.getDay() === 0 ? 6 : date.getDay() - 1];
    if (!dayKey || date.getDay() === 0 || date.getDay() === 6) return []; // Skip weekends
    
    return events.filter(event => {
      return event.day === dayKey;
    });
  };

  const getTasksForDate = (date) => {
    const dayKey = dayKeys[date.getDay() === 0 ? 6 : date.getDay() - 1];
    if (!dayKey || date.getDay() === 0 || date.getDay() === 6) return [];
    
    return tasks.filter(task => 
      task.time_slots && task.time_slots.some(slot => slot.day === dayKey)
    );
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Month Header */}
      <div className="grid grid-cols-7 border-b bg-gray-50">
        {fullDayNames.map(day => (
          <div key={day} className="p-4 text-center font-medium text-sm">
            {day.slice(0, 3)}
          </div>
        ))}
      </div>
      
      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {monthDays.map((day, index) => {
          const dayEvents = getEventsForDate(day.date);
          const dayTasks = getTasksForDate(day.date);
          const allItems = [...dayEvents, ...dayTasks];
          const visibleItems = allItems.slice(0, 2);
          const remainingCount = allItems.length - visibleItems.length;
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
          
          return (
            <div
              key={index}
              onClick={() => !isWeekend && onDayClick(day.date)}
              className={`min-h-24 p-2 border-b border-r cursor-pointer transition-all ${
                !day.isCurrentMonth 
                  ? 'bg-gray-100 text-gray-400' 
                  : isWeekend 
                    ? 'bg-gray-50 cursor-not-allowed' 
                    : 'hover:bg-blue-50'
              }`}
            >
              <div className="font-medium text-sm mb-1">
                {day.date.getDate()}
              </div>
              
              {visibleItems.map((item, idx) => (
                <div
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.client) { // It's an event
                      onEventClick(item);
                    }
                  }}
                  className={`text-xs p-1 mb-1 rounded cursor-pointer transition-all ${
                    item.client 
                      ? `${statusColors[item.status]} hover:opacity-80`
                      : 'border'
                  }`}
                  style={!item.client ? { backgroundColor: item.color, opacity: 0.8 } : {}}
                >
                  {item.client ? item.client : `${item.icon} ${item.name}`}
                </div>
              ))}
              
              {remainingCount > 0 && (
                <div className="text-xs text-blue-600 font-medium hover:text-blue-800">
                  +{remainingCount} autres
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Main Planning Component
const PlanningScreen = ({ user, sessionToken }) => {
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [earnings, setEarnings] = useState({ paid: 0, unpaid: 0, pending: 0, not_worked: 0, tasks_total: 0, total: 0 });
  const [view, setView] = useState('week'); // 'week' or 'month'
  const [eventModal, setEventModal] = useState({ isOpen: false, event: null });
  const [taskModal, setTaskModal] = useState({ isOpen: false, task: null });
  const [teamModal, setTeamModal] = useState({ isOpen: false });
  const [team, setTeam] = useState(null);
  const [viewingMember, setViewingMember] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineStorage] = useState(new OfflineStorage());

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
  }, [offlineStorage]);

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
        // Handle offline mode
        console.log('Offline mode - using local storage');
        throw new Error('Offline mode');
      }
      throw error;
    }
  };

  const loadWeekData = async () => {
    try {
      if (viewingMember) {
        // Load member's planning
        const planningRes = await apiCall(`/teams/member/${viewingMember.uid}/planning/${currentYear}/${currentWeek}`);
        setEvents(planningRes.data.events || []);
        setTasks(planningRes.data.tasks || []);
        setEarnings({ paid: 0, unpaid: 0, pending: 0, not_worked: 0, tasks_total: 0, total: 0 }); // Don't show earnings for other members
      } else {
        // Load own planning
        const [planningRes, earningsRes] = await Promise.all([
          apiCall(`/planning/week/${currentYear}/${currentWeek}`),
          apiCall(`/planning/earnings/${currentYear}/${currentWeek}`)
        ]);
        
        setEvents(planningRes.data.events || []);
        setTasks(planningRes.data.tasks || []);
        setEarnings(earningsRes.data);
      }
    } catch (error) {
      console.error('Error loading week data:', error);
      if (!isOnline) {
        // Load from offline storage
        const offlineEvents = await offlineStorage.getEvents(currentYear, currentWeek);
        const offlineTasks = await offlineStorage.getTasks(currentYear, currentWeek);
        setEvents(offlineEvents);
        setTasks(offlineTasks);
      }
    }
  };

  const loadMonthData = async () => {
    try {
      const planningRes = await apiCall(`/planning/month/${currentYear}/${currentMonth}`);
      setEvents(planningRes.data.events || []);
      setTasks(planningRes.data.tasks || []);
    } catch (error) {
      console.error('Error loading month data:', error);
    }
  };

  const loadClients = async () => {
    try {
      const response = await apiCall('/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Error loading clients:', error);
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

  useEffect(() => {
    if (view === 'week') {
      loadWeekData();
    } else {
      loadMonthData();
    }
  }, [currentWeek, currentYear, currentMonth, view, viewingMember]);

  useEffect(() => {
    loadClients();
    loadTeam();
  }, []);

  const handleCreateEvent = async (eventData) => {
    try {
      const response = await apiCall('/planning/events', {
        method: 'POST',
        data: eventData
      });
      
      // Save to offline storage
      if (!isOnline) {
        await offlineStorage.saveEvent(response.data);
      }
      
      // Add client if new
      if (eventData.client && !clients.includes(eventData.client)) {
        await apiCall('/clients', {
          method: 'POST',
          data: eventData.client
        });
        setClients([...clients, eventData.client]);
      }
      
      setEventModal({ isOpen: false, event: null });
      view === 'week' ? loadWeekData() : loadMonthData();
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  const handleUpdateEvent = async (eventData) => {
    try {
      await apiCall(`/planning/events/${eventModal.event.id}`, {
        method: 'PUT',
        data: eventData
      });
      
      // Add client if new
      if (eventData.client && !clients.includes(eventData.client)) {
        await apiCall('/clients', {
          method: 'POST',
          data: eventData.client
        });
        setClients([...clients, eventData.client]);
      }
      
      setEventModal({ isOpen: false, event: null });
      view === 'week' ? loadWeekData() : loadMonthData();
    } catch (error) {
      console.error('Error updating event:', error);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await apiCall(`/planning/events/${eventId}`, {
        method: 'DELETE'
      });
      setEventModal({ isOpen: false, event: null });
      view === 'week' ? loadWeekData() : loadMonthData();
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const handleDeleteAllWeekEvents = async () => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer tous les événements de cette semaine ?")) {
      try {
        await apiCall(`/planning/events/week/${currentYear}/${currentWeek}`, {
          method: 'DELETE'
        });
        loadWeekData();
      } catch (error) {
        console.error('Error deleting all events:', error);
      }
    }
  };

  const handleCreateTask = async (taskData) => {
    try {
      const response = await apiCall('/planning/tasks', {
        method: 'POST',
        data: taskData
      });
      
      // Save to offline storage
      if (!isOnline) {
        await offlineStorage.saveTask(response.data);
      }
      
      setTaskModal({ isOpen: false, task: null });
      view === 'week' ? loadWeekData() : loadMonthData();
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleUpdateTask = async (taskData) => {
    try {
      await apiCall(`/planning/tasks/${taskModal.task.id}`, {
        method: 'PUT',
        data: taskData
      });
      setTaskModal({ isOpen: false, task: null });
      view === 'week' ? loadWeekData() : loadMonthData();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await apiCall(`/planning/tasks/${taskId}`, {
        method: 'DELETE'
      });
      setTaskModal({ isOpen: false, task: null });
      view === 'week' ? loadWeekData() : loadMonthData();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const navigateWeek = (direction) => {
    const newWeek = currentWeek + direction;
    if (newWeek < 1) {
      setCurrentWeek(52);
      setCurrentYear(currentYear - 1);
    } else if (newWeek > 52) {
      setCurrentWeek(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentWeek(newWeek);
    }
  };

  const navigateMonth = (direction) => {
    const newMonth = currentMonth + direction;
    if (newMonth < 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else if (newMonth > 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(newMonth);
    }
  };

  const weekDays = getWeekDays(currentYear, currentWeek);

  const getEventsForDay = (dayKey) => {
    return events.filter(event => event.day === dayKey);
  };

  const getTasksForDay = (dayKey) => {
    return tasks.filter(task => 
      task.time_slots && task.time_slots.some(slot => slot.day === dayKey)
    );
  };

  const handleEventClick = (event) => {
    if (!viewingMember) { // Only allow editing own events
      setEventModal({ isOpen: true, event });
    }
  };

  const handleTaskClick = (task) => {
    if (!viewingMember) { // Only allow editing own tasks
      setTaskModal({ isOpen: true, task });
    }
  };

  const handleDayClick = (date) => {
    // Switch to week view for the selected date
    const targetWeek = getCurrentWeek(); // Simplified - should calculate proper week for date
    setCurrentWeek(targetWeek);
    setView('week');
  };

  const switchToMemberView = (member) => {
    setViewingMember(member);
    setView('week'); // Switch to week view when viewing member
  };

  const switchToPersonalView = () => {
    setViewingMember(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-800">📅 Fleemy</h1>
              
              {/* Online/Offline indicator */}
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {isOnline ? '🟢 En ligne' : '🔴 Hors ligne'}
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setView('week')}
                  className={`px-3 py-1 rounded-lg transition-all ${view === 'week' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Semaine
                </button>
                <button
                  onClick={() => setView('month')}
                  className={`px-3 py-1 rounded-lg transition-all ${view === 'month' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Mois
                </button>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Team section */}
              {team && (
                <div className="flex items-center space-x-2">
                  <div className="text-sm text-gray-600">Équipe: {team.name}</div>
                  <div className="flex -space-x-1">
                    {team.members.slice(0, 3).map((member) => (
                      <button
                        key={member.uid}
                        onClick={() => switchToMemberView(member)}
                        className={`w-8 h-8 rounded-full border-2 border-white bg-blue-500 text-white text-xs font-medium hover:z-10 transition-all ${
                          viewingMember?.uid === member.uid ? 'ring-2 ring-blue-400' : ''
                        }`}
                        title={member.name}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </button>
                    ))}
                    {team.members.length > 3 && (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-400 text-white text-xs font-medium flex items-center justify-center">
                        +{team.members.length - 3}
                      </div>
                    )}
                  </div>
                  {viewingMember && (
                    <button
                      onClick={switchToPersonalView}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Mon planning
                    </button>
                  )}
                </div>
              )}
              
              <span className="text-sm text-gray-600">
                Bonjour, {viewingMember ? `Planning de ${viewingMember.name}` : user.name}
              </span>
              
              {!viewingMember && (
                <>
                  <button
                    onClick={() => setTeamModal({ isOpen: true })}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-all"
                  >
                    {team ? 'Gérer équipe' : '+ Équipe'}
                  </button>
                  <button
                    onClick={() => setTaskModal({ isOpen: true, task: null })}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all"
                  >
                    + Tâche
                  </button>
                  <button
                    onClick={() => setEventModal({ isOpen: true, event: null })}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all"
                  >
                    + Événement
                  </button>
                  {view === 'week' && events.length > 0 && (
                    <button
                      onClick={handleDeleteAllWeekEvents}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-all"
                    >
                      Vider semaine
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Navigation */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => view === 'week' ? navigateWeek(-1) : navigateMonth(-1)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-all"
            >
              ◀
            </button>
            <h2 className="text-xl font-semibold">
              {view === 'week' 
                ? `Semaine ${currentWeek}, ${currentYear}`
                : `${monthNames[currentMonth]} ${currentYear}`
              }
            </h2>
            <button
              onClick={() => view === 'week' ? navigateWeek(1) : navigateMonth(1)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-all"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Earnings Summary - Only show for personal view */}
        {!viewingMember && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-green-100 p-4 rounded-lg border border-green-200">
              <div className="text-green-800 font-semibold text-sm">Payé</div>
              <div className="text-2xl font-bold text-green-900">{earnings.paid.toFixed(2)}€</div>
            </div>
            <div className="bg-red-100 p-4 rounded-lg border border-red-200">
              <div className="text-red-800 font-semibold text-sm">Non payé</div>
              <div className="text-2xl font-bold text-red-900">{earnings.unpaid.toFixed(2)}€</div>
            </div>
            <div className="bg-yellow-100 p-4 rounded-lg border border-yellow-200">
              <div className="text-yellow-800 font-semibold text-sm">En attente</div>
              <div className="text-2xl font-bold text-yellow-900">{earnings.pending.toFixed(2)}€</div>
            </div>
            <div className="bg-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="text-blue-800 font-semibold text-sm">Tâches</div>
              <div className="text-2xl font-bold text-blue-900">{earnings.tasks_total.toFixed(2)}€</div>
            </div>
            <div className="bg-gray-100 p-4 rounded-lg border border-gray-200">
              <div className="text-gray-800 font-semibold text-sm">Total</div>
              <div className="text-2xl font-bold text-gray-900">{earnings.total.toFixed(2)}€</div>
            </div>
          </div>
        )}

        {/* Calendar Views */}
        {view === 'week' ? (
          /* Weekly Calendar */
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="grid grid-cols-6 border-b">
              <div className="p-4 bg-gray-50 font-medium text-sm">Heure</div>
              {weekDays.map((date, index) => (
                <div key={index} className="p-4 bg-gray-50 text-center">
                  <div className="font-medium text-sm">{dayNames[index]}</div>
                  <div className="text-xs text-gray-600">
                    {date.getDate()}/{date.getMonth() + 1}
                  </div>
                </div>
              ))}
            </div>

            {/* Time slots */}
            {timeSlots.slice(0, -1).map((time, timeIndex) => (
              <div key={time} className="grid grid-cols-6 border-b hover:bg-gray-50">
                <div className="p-4 bg-gray-50 text-sm font-medium border-r">
                  {time}
                </div>
                {dayKeys.map((dayKey, dayIndex) => {
                  const dayEvents = getEventsForDay(dayKey);
                  const dayTasks = getTasksForDay(dayKey);
                  const slotEvents = dayEvents.filter(event => event.start_time === time);
                  const slotTasks = dayTasks.filter(task => 
                    task.time_slots && task.time_slots.some(slot => slot.day === dayKey && slot.start === time)
                  );

                  const hasOverlap = slotEvents.length > 0 && slotTasks.length > 0;

                  return (
                    <div 
                      key={dayKey}
                      className="p-2 min-h-16 border-r cursor-pointer transition-all hover:bg-blue-50"
                      onClick={() => !viewingMember && setEventModal({ 
                        isOpen: true, 
                        event: { day: dayKey, start_time: time, end_time: timeSlots[timeIndex + 1] }
                      })}
                    >
                      {slotEvents.map(event => (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(event);
                          }}
                          className={`text-xs p-2 mb-1 rounded border cursor-pointer transition-all hover:shadow-md ${statusColors[event.status]}`}
                        >
                          <div className="font-semibold">{event.client}</div>
                          <div className="truncate">{event.description}</div>
                        </div>
                      ))}
                      
                      {slotTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTaskClick(task);
                          }}
                          className={`text-xs p-2 mb-1 rounded border cursor-pointer transition-all hover:shadow-md ${
                            hasOverlap ? 'opacity-60' : ''
                          }`}
                          style={{ backgroundColor: task.color }}
                        >
                          <div className="flex items-center">
                            <span className="mr-1 text-sm">{hasOverlap ? task.icon : task.icon}</span>
                            <span className="font-semibold truncate">{task.name}</span>
                          </div>
                          <div className="font-medium">{task.price.toFixed(2)}€</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          /* Monthly Calendar */
          <MonthView
            year={currentYear}
            month={currentMonth}
            events={events}
            tasks={tasks}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {/* Modals */}
      <EventModal
        isOpen={eventModal.isOpen}
        onClose={() => setEventModal({ isOpen: false, event: null })}
        onSave={eventModal.event && eventModal.event.id ? handleUpdateEvent : handleCreateEvent}
        onDelete={handleDeleteEvent}
        event={eventModal.event}
        clients={clients}
      />
      
      <TaskModal
        isOpen={taskModal.isOpen}
        onClose={() => setTaskModal({ isOpen: false, task: null })}
        onSave={taskModal.task && taskModal.task.id ? handleUpdateTask : handleCreateTask}
        onDelete={handleDeleteTask}
        task={taskModal.task}
      />
      
      <TeamModal
        isOpen={teamModal.isOpen}
        onClose={() => setTeamModal({ isOpen: false })}
      />
    </div>
  );
};

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📅</div>
          <div className="text-xl font-semibold text-gray-700">Chargement de Fleemy...</div>
          <div className="text-sm text-gray-500 mt-2">Votre outil de planning professionnel</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return <PlanningScreen user={user} sessionToken={sessionToken} />;
}

export default App;