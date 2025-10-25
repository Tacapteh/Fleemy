import { useOutletContext, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { contextStore } from '../stores/contextStore';
import { 
  Calendar, 
  DollarSign, 
  Clock, 
  Users, 
  FileText, 
  Settings,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    weekHours: 0,
    weekEarnings: 0,
    payments: { paid: 0, pending: 0, unpaid: 0 },
    upcomingEvents: [],
    teamMembers: []
  });

  const context = contextStore.get();
  const isTeamMode = context?.type === 'team';
  const teamId = context?.teamId;

  useEffect(() => {
    loadDashboardData();
  }, [teamId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Obtenir la semaine et le mois en cours
      const now = new Date();
      const year = now.getFullYear();
      const week = getISOWeek(now);
      const month = now.getMonth() + 1;

      // Charger les données de la semaine en cours pour les revenus
      const earningsParams = new URLSearchParams({
        ...(teamId && { team_id: teamId })
      });
      
      const earningsResponse = await apiFetch(
        `/planning/earnings/${year}/${week}?${earningsParams.toString()}`
      );

      // Charger les événements de la semaine en cours pour calculer les heures réelles
      const weekParams = new URLSearchParams({
        ...(teamId && { team_id: teamId })
      });
      
      const weekEventsResponse = await apiFetch(
        `/planning/week/${year}/${week}?${weekParams.toString()}`
      );

      // Charger les événements du mois en cours pour les prochains créneaux
      const monthParams = new URLSearchParams({
        ...(teamId && { team_id: teamId })
      });
      
      const monthEventsResponse = await apiFetch(
        `/planning/month/${year}/${month}?${monthParams.toString()}`
      );

      // Calculer les heures réelles de la semaine à partir des événements
      const weekHours = calculateRealWeekHours(weekEventsResponse);

      // Extraire les prochains créneaux du mois en cours (événements futurs)
      const upcomingEvents = extractUpcomingEvents(monthEventsResponse, now);

      // Charger les membres de l'équipe si en mode équipe
      let teamMembers = [];
      if (isTeamMode && teamId) {
        try {
          const membersResponse = await apiFetch(`/teams/${teamId}/memberships`);
          teamMembers = membersResponse?.memberships || [];
        } catch (error) {
          console.error('Error loading team members:', error);
        }
      }

      setDashboardData({
        weekHours,
        weekEarnings: earningsResponse?.earnings?.total || 0,
        payments: {
          paid: earningsResponse?.earnings?.paid || 0,
          pending: earningsResponse?.earnings?.pending || 0,
          unpaid: earningsResponse?.earnings?.unpaid || 0
        },
        upcomingEvents,
        teamMembers
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateRealWeekHours = (weekData) => {
    if (!weekData) return 0;
    
    let totalHours = 0;
    
    // Calculer les heures depuis les événements
    const events = weekData.events || [];
    events.forEach(event => {
      try {
        if (event.start_time && event.end_time) {
          const startHour = parseInt(event.start_time.split(':')[0]);
          const endHour = parseInt(event.end_time.split(':')[0]);
          totalHours += (endHour - startHour);
        }
      } catch (error) {
        console.error('Error calculating event hours:', error);
      }
    });

    // Calculer les heures depuis les tâches
    const tasks = weekData.tasks || [];
    tasks.forEach(task => {
      try {
        const timeSlots = task.time_slots || [];
        timeSlots.forEach(slot => {
          if (slot.start && slot.end) {
            const startHour = parseInt(slot.start.split(':')[0]);
            const endHour = parseInt(slot.end.split(':')[0]);
            totalHours += (endHour - startHour);
          }
        });
      } catch (error) {
        console.error('Error calculating task hours:', error);
      }
    });

    return totalHours;
  };

  const extractUpcomingEvents = (monthData, now) => {
    if (!monthData) return [];
    
    const allEvents = [];
    
    // Extraire les événements
    const events = monthData.events || [];
    events.forEach(event => {
      try {
        // Reconstruire la date à partir de year, week, day_of_week
        if (event.year && event.week && event.day_of_week !== undefined && event.start_time) {
          const eventDate = getDateFromWeek(event.year, event.week, event.day_of_week, event.start_time);
          if (eventDate >= now) {
            allEvents.push({
              ...event,
              start: eventDate.toISOString(),
              type: 'event',
              title: event.client_name || event.description || 'Sans titre'
            });
          }
        }
      } catch (error) {
        console.error('Error processing event:', error);
      }
    });

    // Extraire les tâches avec leurs créneaux
    const tasks = monthData.tasks || [];
    tasks.forEach(task => {
      try {
        const timeRanges = task.time_ranges || [];
        timeRanges.forEach(range => {
          if (range.day !== undefined && range.start) {
            // Les tâches utilisent aussi year/week/day
            const taskDate = getDateFromWeek(
              task.year || new Date().getFullYear(), 
              task.week || getISOWeek(now), 
              range.day, 
              range.start
            );
            if (taskDate >= now) {
              allEvents.push({
                ...task,
                start: taskDate.toISOString(),
                type: 'task',
                title: task.label || task.title || 'Tâche sans titre'
              });
            }
          }
        });
      } catch (error) {
        console.error('Error processing task:', error);
      }
    });

    // Trier par date et prendre les 3 premiers
    return allEvents
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 3);
  };

  // Fonction utilitaire pour convertir year/week/day_of_week en Date
  const getDateFromWeek = (year, week, dayOfWeek, time) => {
    // dayOfWeek: 0 = lundi, 6 = dimanche
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    
    const result = new Date(ISOweekStart);
    result.setDate(ISOweekStart.getDate() + dayOfWeek);
    
    // Ajouter l'heure
    if (time) {
      const [hours, minutes] = time.split(':').map(Number);
      result.setHours(hours, minutes || 0, 0, 0);
    }
    
    return result;
  };

  const getISOWeek = (date) => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / 604800000);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return `Aujourd'hui à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Demain à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString('fr-FR', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 p-4 md:p-8 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header Skeleton */}
          <div className="h-12 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          
          {/* Widgets Grid Skeleton */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div 
                key={i} 
                data-testid={`dashboard-skeleton-${i}`}
                className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" 
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      data-testid="dashboard-container"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 p-4 md:p-8 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900"
    >
      <div className="mx-auto max-w-7xl space-y-8">
        {/* En-tête de bienvenue */}
        <div className="space-y-2">
          <h1 
            data-testid="dashboard-welcome-title"
            className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-4xl"
          >
            Bienvenue, {user?.displayName || user?.email?.split('@')[0] || 'Utilisateur'} ✨
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-400">
            Voici un aperçu de votre activité {isTeamMode ? 'd\'équipe' : 'personnelle'}
          </p>
        </div>

        {/* Grille de widgets */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Widget: Cette semaine - Cliquable pour naviguer vers Planning */}
          <div 
            data-testid="dashboard-week-widget"
            onClick={() => navigate(isTeamMode ? `/team/${teamId}` : '/me')}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-blue-200/50 bg-gradient-to-br from-blue-50 to-cyan-50/50 p-6 shadow-sm transition-all hover:scale-[1.02] hover:shadow-lg dark:border-blue-900/30 dark:from-blue-950/40 dark:to-cyan-950/20"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-blue-500/10 p-2 dark:bg-blue-500/20">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">Cette semaine</h3>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {dashboardData.weekHours}h
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {dashboardData.weekEarnings.toFixed(0)} € estimés
                  </p>
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400/20 transition-transform group-hover:scale-110 dark:text-blue-600/20" />
            </div>
          </div>

          {/* Widget: Paiements - Consolidé et Cliquable */}
          <div 
            data-testid="dashboard-payments-widget"
            onClick={() => navigate('/invoices')}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-green-200/50 bg-gradient-to-br from-green-50 to-emerald-50/50 p-6 shadow-sm transition-all hover:scale-[1.02] hover:shadow-lg dark:border-green-900/30 dark:from-green-950/40 dark:to-emerald-950/20"
          >
            <div className="flex items-start justify-between">
              <div className="w-full space-y-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-green-500/10 p-2 dark:bg-green-500/20">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-green-900 dark:text-green-200">Paiements</h3>
                </div>
                
                {/* Montant principal - Payé */}
                <div className="text-center">
                  <p className="text-4xl font-bold text-green-900 dark:text-green-100">
                    {dashboardData.payments.paid.toFixed(0)} €
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">Revenus confirmés</p>
                </div>

                {/* Montants secondaires */}
                <div className="flex items-center justify-between gap-4 border-t border-green-200/50 pt-3 dark:border-green-800/30">
                  <div className="flex-1 text-center">
                    <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                      {dashboardData.payments.pending.toFixed(0)} €
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">En attente</p>
                  </div>
                  <div className="h-8 w-px bg-green-200 dark:bg-green-800" />
                  <div className="flex-1 text-center">
                    <p className="text-lg font-semibold text-red-700 dark:text-red-400">
                      {dashboardData.payments.unpaid.toFixed(0)} €
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-500">À facturer</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Widget: Prochains créneaux */}
          <div 
            data-testid="dashboard-upcoming-widget"
            className="group relative overflow-hidden rounded-2xl border border-purple-200/50 bg-gradient-to-br from-purple-50 to-violet-50/50 p-6 shadow-sm transition-all hover:shadow-md dark:border-purple-900/30 dark:from-purple-950/40 dark:to-violet-950/20 md:col-span-2"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-purple-500/10 p-2 dark:bg-purple-500/20">
                  <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                  Prochains créneaux
                </h3>
              </div>
              <div className="space-y-3">
                {dashboardData.upcomingEvents.length === 0 ? (
                  <p className="py-4 text-center text-sm text-purple-600 dark:text-purple-400">
                    Rien de prévu bientôt ✌
                  </p>
                ) : (
                  dashboardData.upcomingEvents.map((event, idx) => (
                    <div
                      key={idx}
                      data-testid={`upcoming-event-${idx}`}
                      className="flex items-center justify-between rounded-lg border border-purple-200/50 bg-white/50 p-3 transition-colors hover:bg-white/80 dark:border-purple-800/30 dark:bg-purple-950/20 dark:hover:bg-purple-950/30"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-purple-900 dark:text-purple-100">
                          {event.title || event.description || event.label || 'Sans titre'}
                        </p>
                        <p className="text-xs text-purple-600 dark:text-purple-400">
                          {formatDate(event.start)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        event.type === 'task' 
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      }`}>
                        {event.type === 'task' ? 'Tâche' : 'Événement'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
