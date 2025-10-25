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
      // Obtenir la semaine en cours
      const now = new Date();
      const year = now.getFullYear();
      const week = getISOWeek(now);

      // Charger les données de la semaine en cours
      const earningsParams = new URLSearchParams({
        ...(teamId && { team_id: teamId })
      });
      
      const earningsResponse = await apiFetch(
        `/planning/earnings/${year}/${week}?${earningsParams.toString()}`
      );

      // Charger les événements à venir (3 prochains jours)
      const upcomingParams = new URLSearchParams({
        from_iso: now.toISOString(),
        to_iso: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        ...(teamId && { team_id: teamId })
      });

      const eventsResponse = await apiFetch(
        `/planning/v2/events?${upcomingParams.toString()}`
      );

      // Charger les tâches hebdomadaires
      const tasksParams = new URLSearchParams({
        ...(teamId && { team_id: teamId })
      });
      
      const tasksResponse = await apiFetch(
        `/planning/v2/weekly-tasks?${tasksParams.toString()}`
      );

      // Combiner et trier les événements à venir
      const allEvents = [
        ...(eventsResponse?.events || []).map(e => ({ ...e, type: 'event' })),
        ...(tasksResponse?.tasks || []).map(t => ({ ...t, type: 'task' }))
      ]
        .filter(e => e.start && new Date(e.start) >= now)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 3);

      // Calculer les heures de la semaine
      const weekHours = calculateWeekHours(earningsResponse);

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
        upcomingEvents: allEvents,
        teamMembers
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateWeekHours = (earningsData) => {
    if (!earningsData?.earnings) return 0;
    // Estimation basée sur un taux horaire moyen de 50€
    const totalEarnings = earningsData.earnings.total || 0;
    return Math.round(totalEarnings / 50);
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

          {/* Widget: Paiements - Consolidé */}
          <div 
            data-testid="dashboard-payments-widget"
            className="group relative overflow-hidden rounded-2xl border border-green-200/50 bg-gradient-to-br from-green-50 to-emerald-50/50 p-6 shadow-sm transition-all hover:shadow-md dark:border-green-900/30 dark:from-green-950/40 dark:to-emerald-950/20"
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

          {/* Widget: Équipe (si mode équipe) */}
          {isTeamMode && (
            <div 
              data-testid="dashboard-team-widget"
              className="group relative overflow-hidden rounded-2xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50 to-blue-50/50 p-6 shadow-sm transition-all hover:shadow-md dark:border-indigo-900/30 dark:from-indigo-950/40 dark:to-blue-950/20"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-500/10 p-2 dark:bg-indigo-500/20">
                    <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                    Mon équipe
                  </h3>
                </div>
                <div className="space-y-2">
                  <p className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
                    {dashboardData.teamMembers.length}
                  </p>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    {dashboardData.teamMembers.length > 1 ? 'membres' : 'membre'}
                  </p>
                  <button
                    onClick={() => navigate(`/team/${teamId}`)}
                    className="mt-2 w-full rounded-lg bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/30"
                  >
                    Voir le planning équipe
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Accès rapides */}
        <div data-testid="dashboard-quick-access" className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Accès rapides
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => navigate('/me')}
              data-testid="quick-access-planning"
              className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
            >
              <div className="rounded-lg bg-blue-500/10 p-3 transition-colors group-hover:bg-blue-500/20 dark:bg-blue-500/20 dark:group-hover:bg-blue-500/30">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Mon planning</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Gérer mes créneaux</p>
              </div>
            </button>

            {isTeamMode && (
              <button
                onClick={() => navigate(`/team/${teamId}`)}
                data-testid="quick-access-team"
                className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <div className="rounded-lg bg-indigo-500/10 p-3 transition-colors group-hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:group-hover:bg-indigo-500/30">
                  <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Mon équipe</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Planning équipe</p>
                </div>
              </button>
            )}

            <button
              onClick={() => navigate('/quotes')}
              data-testid="quick-access-quotes"
              className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-purple-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-purple-700"
            >
              <div className="rounded-lg bg-purple-500/10 p-3 transition-colors group-hover:bg-purple-500/20 dark:bg-purple-500/20 dark:group-hover:bg-purple-500/30">
                <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Mes devis</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Créer et suivre</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/settings')}
              data-testid="quick-access-settings"
              className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div className="rounded-lg bg-slate-500/10 p-3 transition-colors group-hover:bg-slate-500/20 dark:bg-slate-500/20 dark:group-hover:bg-slate-500/30">
                <Settings className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Paramètres</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Configuration</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
