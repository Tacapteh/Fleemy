import { useOutletContext, useNavigate } from 'react-router-dom';
import { useMemo, useCallback } from 'react';
import { contextStore } from '../stores/contextStore';
import { useSettings } from '../context/SettingsContext';
import useUserWeekSlots from '../hooks/useUserWeekSlots';
import {
  CardSection,
  SectionHeaderRow,
  StatusChip,
  text,
  surface,
  radius,
  WorkIcons,
  DailyLifeIcons,
  StatusIcons,
  WellbeingIcons,
} from '../ui';

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

const isBillableSlot = (slot) => {
  if (!slot || typeof slot !== 'object') {
    return false;
  }

  const normalizedType =
    typeof slot.type === 'string' ? slot.type.trim().toLowerCase() : null;

  if (normalizedType === 'absence') {
    return false;
  }

  const rawStatusCandidates = [
    slot?.payment_status,
    slot?.paymentStatus,
    slot?.status,
    slot?.state,
    slot?.type,
  ];

  let explicitStatus = null;
  for (const candidate of rawStatusCandidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (['task', 'weekly_task', 'weekly-task', 'absence'].includes(normalized)) {
        continue;
      }
    }
    explicitStatus = candidate;
    break;
  }

  if (explicitStatus) {
    const statusCategory = resolveStatusCategoryValue(explicitStatus);
    if (statusCategory === null) {
      return false;
    }
  }

  const hasClientSignal = Boolean(
    (typeof slot?.client === 'string' && slot.client.trim()) ||
      (slot?.client && typeof slot.client === 'object') ||
      (typeof slot?.client_name === 'string' && slot.client_name.trim()) ||
      (typeof slot?.clientName === 'string' && slot.clientName.trim()) ||
      (typeof slot?.client_label === 'string' && slot.client_label.trim()) ||
      (typeof slot?.clientLabel === 'string' && slot.clientLabel.trim()) ||
      (typeof slot?.client_id === 'string' && slot.client_id.trim()) ||
      (typeof slot?.clientId === 'string' && slot.clientId.trim()),
  );

  const numericRate = getSlotRate(slot);
  const hasRate = Number.isFinite(numericRate);

  const normalizedSource =
    typeof slot?.source === 'string' ? slot.source.trim().toLowerCase() : '';
  const normalizedKind =
    typeof slot?.kind === 'string' ? slot.kind.trim().toLowerCase() : '';

  const explicitWeeklyTask =
    slot?.weekly === true ||
    slot?.isWeeklyTask === true ||
    slot?.is_task === true ||
    normalizedSource === 'weekly_task' ||
    normalizedKind === 'weekly_task' ||
    normalizedType === 'task' ||
    normalizedType === 'weekly_task' ||
    normalizedType === 'weekly-task' ||
    typeof slot?.weekly_task_id === 'string' ||
    typeof slot?.weeklyTaskId === 'string' ||
    typeof slot?.task_id === 'string' ||
    typeof slot?.taskId === 'string' ||
    typeof slot?.weekly_task_occurrence_id === 'string' ||
    typeof slot?.weeklyTaskOccurrenceId === 'string' ||
    typeof slot?.task_occurrence_id === 'string' ||
    typeof slot?.taskOccurrenceId === 'string';

  const taskLabel = (() => {
    if (typeof slot?.task_label === 'string' && slot.task_label.trim()) {
      return slot.task_label.trim();
    }
    if (typeof slot?.taskLabel === 'string' && slot.taskLabel.trim()) {
      return slot.taskLabel.trim();
    }
    if (typeof slot?.task_name === 'string' && slot.task_name.trim()) {
      return slot.task_name.trim();
    }
    if (typeof slot?.taskName === 'string' && slot.taskName.trim()) {
      return slot.taskName.trim();
    }
    return '';
  })();

  const hasExplicitStatus = Boolean(explicitStatus);

  const looksLikeStandaloneTask =
    (explicitWeeklyTask || Boolean(taskLabel)) &&
    !hasClientSignal &&
    !hasRate &&
    !hasExplicitStatus;

  if (looksLikeStandaloneTask) {
    return false;
  }

  if (!hasClientSignal && !hasRate && !hasExplicitStatus) {
    return false;
  }

  return true;
};

const calculateWeeklyEstimatedAmount = (slots, globalHourlyRate) => {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 0;
  }

  let total = 0;

  slots.forEach((slot) => {
    if (!isBillableSlot(slot)) {
      return;
    }

    const start = getSlotStartDate(slot);
    const end = getSlotEndDate(slot);
    if (!(start instanceof Date) || !(end instanceof Date)) {
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

    let rateToApply = null;
    const client = slot?.client;

    if (
      client &&
      (client.useGlobalRate === false || client.use_global_rate === false)
    ) {
      const clientRateCandidates = [client.hourlyRate, client.hourly_rate];
      for (const candidate of clientRateCandidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          rateToApply = numeric;
          break;
        }
      }
    }

    if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
      const numericGlobalRate = Number(globalHourlyRate);
      if (Number.isFinite(numericGlobalRate) && numericGlobalRate > 0) {
        rateToApply = numericGlobalRate;
      }
    }

    if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
      rateToApply = getSlotRate(slot);
    }

    const numericRate = Number(rateToApply);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      return;
    }

    const amount = durationHours * numericRate;
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  });

  return total;
};

const resolveSlotLabel = (slot) => {
  if (!slot) {
    return 'Créneau planifié';
  }
  const slotType =
    typeof slot.type === 'string' ? slot.type.trim().toLowerCase() : '';
  if (slotType === 'absence') {
    return 'Indisponible';
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
  const planningPath = isTeamMode && teamId ? `/team/${teamId}` : '/me';

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

  const { weeklyHours, paymentTotals, upcomingSlots } = useMemo(() => {
    const totals = { confirmed: 0, pending: 0, toInvoice: 0 };
    let hoursTotal = 0;
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

      const billable = isBillableSlot(slot);

      if (billable) {
        hoursTotal += durationHours;
      }

      const slotRate = getSlotRate(slot);
      const rateToApply = Number.isFinite(slotRate) && slotRate > 0 ? slotRate : globalHourlyRate;

      let amount = 0;
      if (Number.isFinite(rateToApply) && rateToApply > 0) {
        amount = durationHours * rateToApply;
        if (!Number.isFinite(amount) || amount <= 0) {
          amount = 0;
        }
      }

      if (!billable) {
        amount = 0;
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
      paymentTotals: totals,
      upcomingSlots: upcoming,
    };
  }, [slots, globalHourlyRate]);

  const weeklyEstimatedAmount = useMemo(
    () => calculateWeeklyEstimatedAmount(slots, globalHourlyRate),
    [slots, globalHourlyRate],
  );

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
    const value = Number.isFinite(weeklyEstimatedAmount) ? weeklyEstimatedAmount : 0;
    return currencyFormatter.format(Math.round(value));
  }, [weeklyEstimatedAmount, currencyFormatter]);

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

  const handleUpcomingWidgetClick = useCallback(() => {
    navigate({ pathname: planningPath, search: '?view=month' });
  }, [navigate, planningPath]);

  const handleUpcomingWidgetKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        handleUpcomingWidgetClick();
      }
    },
    [handleUpcomingWidgetClick],
  );

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
        <div className="space-y-3">
          <SectionHeaderRow
            data-testid="dashboard-welcome-title"
            icon={
              <WellbeingIcons.Smile
                aria-hidden="true"
                className="h-6 w-6 text-slate-200"
              />
            }
            title={`Bienvenue, ${
              user?.displayName || user?.email?.split('@')[0] || 'Utilisateur'
            }`}
            titleClassName="text-2xl md:text-3xl font-semibold"
          />
          <p className={`text-sm md:text-base ${text.secondary}`}>
            Voici un aperçu de votre activité {isTeamMode ? 'd\'équipe' : 'personnelle'}
          </p>
          {slotsError && (
            <p className="text-sm text-red-400 dark:text-red-400">{slotsError}</p>
          )}
        </div>

        {/* Grille de widgets */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Widget: Cette semaine - Cliquable pour naviguer vers Planning */}
          <div
            data-testid="dashboard-week-widget"
            onClick={() => navigate(isTeamMode ? `/team/${teamId}` : '/me')}
            className="group cursor-pointer"
          >
            <CardSection
              variant="planning"
              icon={
                <WorkIcons.Clock aria-hidden="true" className="h-5 w-5" />
              }
              title="Cette semaine"
              subtitle={isTeamMode ? 'Vue équipe' : 'Vue personnelle'}
              className="h-full transition-transform group-hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className={`text-4xl font-semibold leading-tight ${text.primary}`}>
                    {weeklyHoursDisplay}h
                  </p>
                  <p className={`text-sm ${text.secondary}`}>
                    {weeklyEarningsDisplay} estimés
                  </p>
                </div>
                <WorkIcons.TrendingUp
                  aria-hidden="true"
                  className="h-10 w-10 text-blue-400/40"
                />
              </div>
            </CardSection>
          </div>

          {/* Widget: Paiements - Consolidé et Cliquable */}
          <div
            data-testid="dashboard-payments-widget"
            onClick={() => navigate('/invoices')}
            className="group cursor-pointer"
          >
            <CardSection
              variant="money"
              icon={
                <DailyLifeIcons.DollarSign
                  aria-hidden="true"
                  className="h-5 w-5"
                />
              }
              title="Paiements"
              subtitle="Suivi des règlements"
              className="h-full transition-transform group-hover:scale-[1.01]"
            >
              <div className="space-y-5">
                <div className="text-center">
                  <p className={`text-4xl font-semibold ${text.primary}`}>
                    {paymentsDisplay.confirmed}
                  </p>
                  <p className={`text-sm ${text.secondary}`}>Revenus confirmés</p>
                </div>

                <div className="space-y-3">
                  <div
                    className={`${radius.card} ${surface.base} ${surface.border} flex items-center justify-between gap-3 px-3 py-2`}
                  >
                    <StatusChip
                      statusKey="done"
                      label="Payé"
                      srLabel="Paiements confirmés"
                      icon={
                        <StatusIcons.CheckCircle
                          aria-hidden="true"
                          className="h-3 w-3"
                        />
                      }
                    />
                    <p className={`text-lg font-semibold ${text.primary}`}>
                      {paymentsDisplay.confirmed}
                    </p>
                  </div>
                  <div
                    className={`${radius.card} ${surface.base} ${surface.border} flex items-center justify-between gap-3 px-3 py-2`}
                  >
                    <StatusChip
                      statusKey="doing"
                      label="En attente"
                      srLabel="Paiements en attente"
                      icon={
                        <StatusIcons.Loader
                          aria-hidden="true"
                          className="h-3 w-3"
                        />
                      }
                    />
                    <p className={`text-lg font-semibold ${text.primary}`}>
                      {paymentsDisplay.pending}
                    </p>
                  </div>
                  <div
                    className={`${radius.card} ${surface.base} ${surface.border} flex items-center justify-between gap-3 px-3 py-2`}
                  >
                    <StatusChip
                      statusKey="todo"
                      label="À facturer"
                      srLabel="Montants à facturer"
                      icon={
                        <DailyLifeIcons.CreditCard
                          aria-hidden="true"
                          className="h-3 w-3"
                        />
                      }
                    />
                    <p className={`text-lg font-semibold ${text.primary}`}>
                      {paymentsDisplay.toInvoice}
                    </p>
                  </div>
                </div>
              </div>
            </CardSection>
          </div>

          {/* Widget: Prochains créneaux */}
          <div
            data-testid="dashboard-upcoming-widget"
            role="button"
            tabIndex={0}
            aria-label="Ouvrir la vue mensuelle du planning"
            onClick={handleUpcomingWidgetClick}
            onKeyDown={handleUpcomingWidgetKeyDown}
            className="group cursor-pointer md:col-span-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl"
          >
            <CardSection
              variant="planning"
              icon={
                <WorkIcons.Calendar aria-hidden="true" className="h-5 w-5" />
              }
              title="Prochains créneaux"
              subtitle={
                upcomingWithDetails.length === 0
                  ? 'Aucun créneau imminent'
                  : 'Vos rendez-vous à venir'
              }
              className="h-full transition-transform group-hover:scale-[1.01]"
            >
              <div className="space-y-3">
                {upcomingWithDetails.length === 0 ? (
                  <div
                    className={`${radius.card} ${surface.base} ${surface.border} flex flex-col items-center gap-2 px-4 py-6 text-center`}
                  >
                    <StatusIcons.Info
                      aria-hidden="true"
                      className="h-5 w-5 text-blue-300"
                    />
                    <p className={`text-sm ${text.secondary}`}>
                      Aucun créneau prévu pour le moment
                    </p>
                  </div>
                ) : (
                  upcomingWithDetails.map((slot, idx) => (
                    <div
                      key={slot.id || idx}
                      data-testid={`upcoming-event-${idx}`}
                      className={`${radius.card} ${surface.base} ${surface.border} flex items-center justify-between gap-3 px-4 py-3 transition-colors`}
                    >
                      <div className="flex-1">
                        <p className={`font-medium ${text.primary}`}>
                          {slot.label}
                        </p>
                        <p className={`text-xs ${text.secondary}`}>
                          {slot.detail}
                        </p>
                      </div>
                      <StatusChip
                        statusKey="doing"
                        label="Planifié"
                        srLabel="Créneau planifié"
                        icon={
                          <WorkIcons.Clock
                            aria-hidden="true"
                            className="h-3 w-3"
                          />
                        }
                      />
                    </div>
                  ))
                )}
              </div>
            </CardSection>
          </div>

        </div>
      </div>
    </div>
  );
}
