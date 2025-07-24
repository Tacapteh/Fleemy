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
  for (let i = 0; i < 7; i++) {
    const day = new Date(ISOweekStart);
    day.setDate(ISOweekStart.getDate() + i);
    days.push(day);
  }
  return days;
};

const timeSlots = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const statusColors = {
  paid: "bg-green-100 border-green-300 text-green-800",
  unpaid: "bg-red-100 border-red-300 text-red-800",
  pending: "bg-yellow-100 border-yellow-300 text-yellow-800",
  not_worked: "bg-gray-100 border-gray-300 text-gray-800"
};

const pastelloColors = [
  "#FFB3E6", "#FFE5B3", "#B3FFB3", "#B3E5FF", "#E5B3FF", 
  "#FFB3B3", "#B3FFFF", "#FFE5FF", "#E5FFB3", "#B3B3FF"
];

const icons = [
  "💼", "📝", "📞", "💻", "📊", "🎯", "📈", "⚙️", "🔧", "📅",
  "✅", "📋", "💡", "🚀", "⭐", "🎨", "📖", "🔍", "💰", "🎵"
];

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
        <p className="text-gray-600 mb-8">Votre outil de gestion de planning et tâches</p>
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Se connecter
        </button>
      </div>
    </div>
  );
};

// Event Modal
const EventModal = ({ isOpen, onClose, onSave, event = null }) => {
  const [formData, setFormData] = useState({
    description: "",
    client: "",
    day: "monday",
    start_time: "09:00",
    end_time: "10:00",
    status: "pending"
  });

  useEffect(() => {
    if (event) {
      setFormData(event);
    } else {
      setFormData({
        description: "",
        client: "",
        day: "monday",
        start_time: "09:00",
        end_time: "10:00",
        status: "pending"
      });
    }
  }, [event, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">
          {event ? "Modifier l'événement" : "Nouvel événement"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <input
              type="text"
              value={formData.client}
              onChange={(e) => setFormData({...formData, client: e.target.value})}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jour</label>
            <select
              value={formData.day}
              onChange={(e) => setFormData({...formData, day: e.target.value})}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {timeSlots.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
              <select
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {timeSlots.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="pending">En attente</option>
              <option value="paid">Payé</option>
              <option value="unpaid">Non payé</option>
              <option value="not_worked">Pas travaillé</option>
            </select>
          </div>
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {event ? "Modifier" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Task Modal
const TaskModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    color: pastelloColors[0],
    icon: icons[0],
    time_slots: []
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Nouvelle tâche hebdomadaire</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prix (€)</label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
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
                  className={`w-8 h-8 rounded-full border-2 ${formData.color === color ? 'border-gray-800' : 'border-gray-300'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icône</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {icons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData({...formData, icon})}
                  className={`p-2 rounded-lg border ${formData.icon === icon ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Planning Component
const PlanningScreen = ({ user, sessionToken }) => {
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [earnings, setEarnings] = useState({ paid: 0, unpaid: 0, pending: 0, tasks_total: 0 });
  const [view, setView] = useState('week'); // 'week' or 'month'
  const [eventModal, setEventModal] = useState({ isOpen: false, event: null });
  const [taskModal, setTaskModal] = useState({ isOpen: false });

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

  const loadWeekData = async () => {
    try {
      const [planningRes, earningsRes] = await Promise.all([
        apiCall(`/planning/week/${currentYear}/${currentWeek}`),
        apiCall(`/planning/earnings/${currentYear}/${currentWeek}`)
      ]);
      
      setEvents(planningRes.data.events || []);
      setTasks(planningRes.data.tasks || []);
      setEarnings(earningsRes.data);
    } catch (error) {
      console.error('Error loading week data:', error);
    }
  };

  useEffect(() => {
    loadWeekData();
  }, [currentWeek, currentYear]);

  const handleCreateEvent = async (eventData) => {
    try {
      await apiCall('/planning/events', {
        method: 'POST',
        data: eventData
      });
      setEventModal({ isOpen: false, event: null });
      loadWeekData();
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  const handleCreateTask = async (taskData) => {
    try {
      await apiCall('/planning/tasks', {
        method: 'POST',
        data: taskData
      });
      setTaskModal({ isOpen: false });
      loadWeekData();
    } catch (error) {
      console.error('Error creating task:', error);
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

  const weekDays = getWeekDays(currentYear, currentWeek);

  const getEventsForDay = (dayKey) => {
    return events.filter(event => event.day === dayKey);
  };

  const getTasksForDay = (dayKey) => {
    return tasks.filter(task => 
      task.time_slots && task.time_slots.some(slot => slot.day === dayKey)
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-800">📅 Fleemy</h1>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setView('week')}
                  className={`px-3 py-1 rounded-lg ${view === 'week' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
                >
                  Semaine
                </button>
                <button
                  onClick={() => setView('month')}
                  className={`px-3 py-1 rounded-lg ${view === 'month' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
                >
                  Mois
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Bonjour, {user.name}</span>
              <button
                onClick={() => setTaskModal({ isOpen: true })}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
              >
                + Tâche
              </button>
              <button
                onClick={() => setEventModal({ isOpen: true, event: null })}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                + Événement
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Week Navigation */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateWeek(-1)}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              ◀
            </button>
            <h2 className="text-xl font-semibold">
              Semaine {currentWeek}, {currentYear}
            </h2>
            <button
              onClick={() => navigateWeek(1)}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Earnings Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-100 p-4 rounded-lg">
            <div className="text-green-800 font-semibold">Payé</div>
            <div className="text-2xl font-bold text-green-900">{earnings.paid}€</div>
          </div>
          <div className="bg-red-100 p-4 rounded-lg">
            <div className="text-red-800 font-semibold">Non payé</div>
            <div className="text-2xl font-bold text-red-900">{earnings.unpaid}€</div>
          </div>
          <div className="bg-yellow-100 p-4 rounded-lg">
            <div className="text-yellow-800 font-semibold">En attente</div>
            <div className="text-2xl font-bold text-yellow-900">{earnings.pending}€</div>
          </div>
          <div className="bg-blue-100 p-4 rounded-lg">
            <div className="text-blue-800 font-semibold">Tâches</div>
            <div className="text-2xl font-bold text-blue-900">{earnings.tasks_total}€</div>
          </div>
        </div>

        {/* Weekly Calendar */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="grid grid-cols-8 border-b">
            <div className="p-4 bg-gray-50 font-medium">Heure</div>
            {weekDays.map((date, index) => (
              <div key={index} className="p-4 bg-gray-50 text-center">
                <div className="font-medium">{dayNames[index]}</div>
                <div className="text-sm text-gray-600">
                  {date.getDate()}/{date.getMonth() + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Time slots */}
          {timeSlots.slice(0, -1).map((time, timeIndex) => (
            <div key={time} className="grid grid-cols-8 border-b">
              <div className="p-4 bg-gray-50 text-sm font-medium">{time}</div>
              {dayKeys.map((dayKey, dayIndex) => {
                const dayEvents = getEventsForDay(dayKey);
                const dayTasks = getTasksForDay(dayKey);
                const slotEvents = dayEvents.filter(event => event.start_time === time);
                const slotTasks = dayTasks.filter(task => 
                  task.time_slots && task.time_slots.some(slot => slot.day === dayKey && slot.start === time)
                );

                return (
                  <div 
                    key={dayKey}
                    className="p-2 min-h-16 border-r hover:bg-gray-50 cursor-pointer"
                    onClick={() => setEventModal({ 
                      isOpen: true, 
                      event: { day: dayKey, start_time: time, end_time: timeSlots[timeIndex + 1] }
                    })}
                  >
                    {slotEvents.map(event => (
                      <div
                        key={event.id}
                        className={`text-xs p-1 mb-1 rounded border ${statusColors[event.status]}`}
                      >
                        <div className="font-medium">{event.client}</div>
                        <div>{event.description}</div>
                      </div>
                    ))}
                    {slotTasks.map(task => (
                      <div
                        key={task.id}
                        className="text-xs p-1 mb-1 rounded border"
                        style={{ backgroundColor: task.color, opacity: 0.8 }}
                      >
                        <div className="flex items-center">
                          <span className="mr-1">{task.icon}</span>
                          <span className="font-medium">{task.name}</span>
                        </div>
                        <div>{task.price}€</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <EventModal
        isOpen={eventModal.isOpen}
        onClose={() => setEventModal({ isOpen: false, event: null })}
        onSave={handleCreateEvent}
        event={eventModal.event}
      />
      <TaskModal
        isOpen={taskModal.isOpen}
        onClose={() => setTaskModal({ isOpen: false })}
        onSave={handleCreateTask}
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
          <div className="text-xl">Chargement...</div>
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