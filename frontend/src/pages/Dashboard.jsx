import { useOutletContext, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { contextStore } from '../stores/contextStore';
import { useSettings } from '../context/SettingsContext';
import useUserWeekSlots from '../hooks/useUserWeekSlots';
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
  HelpCircle,
} from 'lucide-react';

const toDateSafe = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  if (typeof value === 'number') {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed;
    const candidate = new Date(normalized);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      const candidate = value.toDate();
      return candidate instanceof Date && !Number.isNaN(candidate.getTime())
        ? candidate
        : null;
    } catch (error) {
      return null;
    }
  }

  return null;
};

const getSlotStartDate = (slot) => {
  if (!slot) {
    return null;
  }
  return (
    toDateSafe(slot.start) ??
    toDateSafe(slot.startTime) ??
    toDateSafe(slot.start_time) ??
    toDateSafe(slot.startDate) ??
    toDateSafe(slot.start_date) ??
    null
  );
};

const getSlotEndDate = (slot) => {
  if (!slot) {
    return null;
  }
  return (
    toDateSafe(slot.end) ??
    toDateSafe(slot.endTime) ??
    toDateSafe(slot.end_time) ??
    toDateSafe(slot.endDate) ??
    toDateSafe(slot.end_date) ??
    null
  );
};

const resolveStatusCategoryValue = (status) => {
  if (status === null || status === undefined) {
    return 'unpaid';
  }
  const normalized = status.toString().trim().toLowerCase();
  if (!normalized) {
    return 'unpaid';
  }
  if (['not_worked', 'cancelled', 'canceled'].includes(normalized)) {
    return null;
  }
  if (
    [
      'paid',
      'payé',
      'paye',
      'payee',
      'réglé',
      'regle',
      'reglé',
      'reglee',
      'settled',
    ].includes(normalized)
  ) {
    return 'paid';
  }
  if (
    [
      'pending',
      'waiting',
      'awaiting',
      'en attente',
      'en_attente',
      'attente',
      'quote',
      'quote_sent',
      'sent',
      'devis',
      'devis envoyé',
      'devis_envoye',
      'estimate',
      'estimation',
      'waiting_payment',
    ].includes(normalized)
  ) {
    return 'pending';
  }
  if (
    [
      'unpaid',
      'non payé',
      'non_paye',
      'impayé',
      'impaye',
      'overdue',
    ].includes(normalized)
  ) {
    return 'unpaid';
  }
  return 'pending';
};

const getSlotPaymentCategory = (slot) => {
  if (!slot) {
    return 'unpaid';
  }
  const candidates = [
    slot.payment_status,
    slot.paymentStatus,
    slot.status,
    slot.type,
    slot.state,
  ];
  const firstNonNull = candidates.find(
    (candidate) => candidate !== undefined && candidate !== null,
  );
  return resolveStatusCategoryValue(firstNonNull);
};

const getSlotRate = (slot) => {
  if (!slot) {
    return null;
  }
  const candidates = [
    slot.hourly_rate,
    slot.hourlyRate,
    slot.rate,
    slot.price_per_hour,
    slot.pricePerHour,
    slot.hourly_rate_value,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
};

const resolveSlotLabel = (slot) => {
  if (!slot) {
    return 'Créneau planifié';
  }
  const candidates = [
    slot.client_name,
    slot.clientName,
    typeof slot.client === 'string' ? slot.client : null,
    slot.client?.name,
    slot.client?.label,
    slot.title,
    slot.description,
    slot.task_label,
    slot.taskLabel,
    slot.task_name,
    slot.taskName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return 'Créneau planifié';
};

export default function Dashboard() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const context = contextStore.get();
  const isTeamMode = context?.type === 'team';
  const teamId = context?.teamId;

  const {
    slots,
    loading: slotsLoading,
    error: slotsError,
  } = useUserWeekSlots(user?.uid);

  const globalHourlyRate = useMemo(() => {
    const numeric = Number(settings?.hourlyRateGlobal);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.round(numeric * 100) / 100;
    }
    return 0;
  }, [settings?.hourlyRateGlobal]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [],
  );

  const { weeklyHours, weeklyEarnings, paymentTotals, upcomingSlots } = useMemo(() => {
    const totals = { confirmed: 0, pending: 0, toInvoice: 0 };
    let hoursTotal = 0;
    let earningsTotal = 0;
    const future = [];
    const now = new Date();

    const sourceSlots = Array.isArray(slots) ? slots : [];

    sourceSlots.forEach((slot) => {
      const start = getSlotStartDate(slot);
      const end = getSlotEndDate(slot);
      if (!start || !end) {
        return;
      }
      const durationMs = end.getTime() - start.getTime();
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return;
      }

      const durationHours = durationMs / (60 * 60 * 1000);
      if (!Number.isFinite(durationHours) || durationHours <= 0) {
        return;
      }

      hoursTotal += durationHours;

      const slotRate = getSlotRate(slot);
      const rateToApply = Number.isFinite(slotRate) && slotRate > 0 ? slotRate : globalHourlyRate;

      let amount = 0;
      if (Number.isFinite(rateToApply) && rateToApply > 0) {
        amount = durationHours * rateToApply;
        if (Number.isFinite(amount) && amount > 0) {
          earningsTotal += amount;
        } else {
          amount = 0;
        }
      }

      const statusCategory = getSlotPaymentCategory(slot);
      if (Number.isFinite(amount) && amount > 0 && statusCategory) {
        if (statusCategory === 'paid') {
          totals.confirmed += amount;
        } else if (statusCategory === 'pending') {
          totals.pending += amount;
        } else if (statusCategory === 'unpaid') {
          totals.toInvoice += amount;
        }
      }

      if (start.getTime() > now.getTime()) {
        future.push({ slot, start, end });
      }
    });

    const upcoming = future
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 3)
      .map((entry, index) => ({
        id: entry.slot?.id || `slot-${entry.start.getTime()}-${index}`,
        start: entry.start,
        end: entry.end,
        label: resolveSlotLabel(entry.slot),
      }));

    return {
      weeklyHours: hoursTotal,
      weeklyEarnings: earningsTotal,
      paymentTotals: totals,
      upcomingSlots: upcoming,
    };
  }, [slots, globalHourlyRate]);

  const weeklyHoursDisplay = useMemo(() => {
    const rounded = Math.round((Number.isFinite(weeklyHours) ? weeklyHours : 0) * 4) / 4;
    if (!Number.isFinite(rounded) || rounded <= 0) {
      return '0';
    }
    const decimalPart = Math.abs(rounded % 1);
    const needsDecimal = decimalPart > 0.001;
    return rounded.toLocaleString('fr-FR', {
      minimumFractionDigits: needsDecimal ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }, [weeklyHours]);

  const weeklyEarningsDisplay = useMemo(() => {
    const value = Number.isFinite(weeklyEarnings) ? weeklyEarnings : 0;
    return currencyFormatter.format(Math.round(value));
  }, [weeklyEarnings, currencyFormatter]);

  const paymentsDisplay = useMemo(
    () => ({
      confirmed: currencyFormatter.format(Math.round(paymentTotals.confirmed || 0)),
      pending: currencyFormatter.format(Math.round(paymentTotals.pending || 0)),
      toInvoice: currencyFormatter.format(Math.round(paymentTotals.toInvoice || 0)),
    }),
    [paymentTotals, currencyFormatter],
  );

  const formatUpcomingDetail = (start, end) => {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
      return '';
    }
    const startLabel = start.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const startTime = start.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = end instanceof Date && !Number.isNaN(end.getTime())
      ? end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : null;
    return endTime ? `${startLabel} · ${startTime} - ${endTime}` : `${startLabel} · ${startTime}`;
  };

  const upcomingWithDetails = upcomingSlots.map((slot) => ({
    ...slot,
    detail: formatUpcomingDetail(slot.start, slot.end),
  }));

  const loading = slotsLoading;

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
          {slotsError && (
            <p className="text-sm text-red-600 dark:text-red-400">{slotsError}</p>
          )}
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
                    {weeklyHoursDisplay}h
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {weeklyEarningsDisplay} estimés
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
                    {paymentsDisplay.confirmed}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">Revenus confirmés</p>
                </div>

                {/* Montants secondaires */}
                <div className="flex items-center justify-between gap-4 border-t border-green-200/50 pt-3 dark:border-green-800/30">
                  <div className="flex-1 text-center">
                    <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                      {paymentsDisplay.pending}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">En attente</p>
                  </div>
                  <div className="h-8 w-px bg-green-200 dark:bg-green-800" />
                  <div className="flex-1 text-center">
                    <p className="text-lg font-semibold text-red-700 dark:text-red-400">
                      {paymentsDisplay.toInvoice}
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
                {upcomingWithDetails.length === 0 ? (
                  <p className="py-4 text-center text-sm text-purple-600 dark:text-purple-400">
                    Rien de prévu bientôt ✌
                  </p>
                ) : (
                  upcomingWithDetails.map((slot, idx) => (
                    <div
                      key={slot.id || idx}
                      data-testid={`upcoming-event-${idx}`}
                      className="flex items-center justify-between rounded-lg border border-purple-200/50 bg-white/50 p-3 transition-colors hover:bg-white/80 dark:border-purple-800/30 dark:bg-purple-950/20 dark:hover:bg-purple-950/30"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-purple-900 dark:text-purple-100">
                          {slot.label}
                        </p>
                        <p className="text-xs text-purple-600 dark:text-purple-400">
                          {slot.detail}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Créneau
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
