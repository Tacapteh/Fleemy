import React from 'react';
import type { DisplayEvent } from '../selectors/planningSelectors';
import TaskIconBadge from './TaskIconBadge';
import { openTaskModal, confirmDeleteTask } from '../store/uiStore';

const normalizeOptionalString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
};

const resolveClientLabel = (event: DisplayEvent): string => {
  const fromDisplayName = normalizeOptionalString((event as { clientDisplayName?: string }).clientDisplayName);
  if (fromDisplayName) {
    return fromDisplayName;
  }

  const fromClientName = normalizeOptionalString((event as { client_name?: string }).client_name);
  if (fromClientName) {
    return fromClientName;
  }

  const rawClient = (event as { client?: unknown }).client;
  if (typeof rawClient === 'string') {
    const label = normalizeOptionalString(rawClient);
    if (label) {
      return label;
    }
  } else if (rawClient && typeof rawClient === 'object') {
    const clientObject = rawClient as { display_name?: string; name?: string; label?: string };
    const fromObject =
      normalizeOptionalString(clientObject.display_name) ||
      normalizeOptionalString(clientObject.name) ||
      normalizeOptionalString(clientObject.label);
    if (fromObject) {
      return fromObject;
    }
  }

  return '';
};

interface EventCardProps {
  event: DisplayEvent;
  onClick?: (event: DisplayEvent) => void;
  style?: React.CSSProperties;
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick, style }) => {
  const handleClick = React.useCallback(() => {
    if (onClick) {
      onClick(event);
    }
  }, [event, onClick]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onClick) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(event);
      }
    },
    [event, onClick]
  );

  const eventType = normalizeOptionalString((event as { type?: string }).type).toLowerCase();
  const isAbsence = eventType === 'absence';

  const teamParticipants = Array.isArray((event as { teamParticipants?: any[] }).teamParticipants)
    ? (event as { teamParticipants?: any[] }).teamParticipants.slice(0, 3)
    : [];
  const hasTeamParticipants = teamParticipants.length > 0;
  const mergedTooltip = normalizeOptionalString((event as { teamMergedTooltip?: string }).teamMergedTooltip);
  const additionalBadgeCount = Array.isArray((event as { teamParticipants?: any[] }).teamParticipants)
    ? Math.max(0, (event as { teamParticipants?: any[] }).teamParticipants.length - teamParticipants.length)
    : 0;

  const explicitTitle = !isAbsence ? normalizeOptionalString(event.title) : '';
  const clientLabel = isAbsence ? '' : resolveClientLabel(event);
  const description = normalizeOptionalString(event.description);

  const startTimeLabel = event.startDate
    ? event.startDate.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const endTimeLabel = event.endDate
    ? event.endDate.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const timeLabel = startTimeLabel && endTimeLabel ? `${startTimeLabel} - ${endTimeLabel}` : '';

  const title = isAbsence ? 'Indisponible' : explicitTitle || clientLabel || description || 'Événement';
  const statusClass = !isAbsence && event.status ? ` status-${event.status}` : '';
  const isInteractive = typeof onClick === 'function';
  const isReadOnly = Boolean(event.readOnly);

  let subtitle = '';
  let subtitleClass = 'subtitle truncate break-words leading-tight md:leading-normal text-xs text-gray-600';
  if (!isAbsence) {
    if (clientLabel && clientLabel !== title) {
      subtitle = clientLabel;
      subtitleClass = 'subtitle truncate leading-tight md:leading-normal break-words';
    } else if (description && description !== title) {
      subtitle = description;
    }
  } else if (description && description.toLowerCase() !== 'indisponible') {
    subtitle = description;
  }

  return (
    <div
      className={`event-chip${statusClass}${isAbsence ? ' absence' : ''} min-h-[3rem] transition-transform transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-100/70 dark:focus-visible:ring-offset-slate-900`}
      style={style}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : 'group'}
      tabIndex={isInteractive ? 0 : -1}
      aria-label={`Événement : ${title}`}
      title={mergedTooltip || undefined}
      data-testid={`event-${event.id}`}
    >
      <div className="event-chip-content relative flex h-full min-h-[3rem] w-full flex-col justify-center gap-1 pr-8 pb-5 text-[13px] leading-tight sm:text-[14px] md:leading-normal">
        {timeLabel && (
          <div className="mb-1 text-xs font-semibold leading-tight text-slate-600 dark:text-slate-200">
            {timeLabel}
          </div>
        )}
        <div className="title truncate break-words leading-tight md:leading-normal">{title}</div>

        {hasTeamParticipants && (
          <div className="absolute bottom-1 left-1 flex items-center gap-1">
            {teamParticipants.map((participant, index) => (
              <span
                key={`${participant.id || participant.initials || index}`}
                className="flex h-6 w-6 items-center justify-center rounded-full border text-[0.65rem] font-semibold"
                style={{
                  backgroundColor: participant.background || 'var(--event-color, #2563eb)',
                  borderColor: participant.border || 'transparent',
                  color: participant.text || '#ffffff',
                }}
                title={participant.name ? `Créé par ${participant.name}` : undefined}
                aria-label={participant.name ? `Créé par ${participant.name}` : 'Créateur inconnu'}
              >
                {normalizeOptionalString(participant.initials) || '??'}
              </span>
            ))}
            {additionalBadgeCount > 0 && (
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300" aria-hidden="true">
                +{additionalBadgeCount}
              </span>
            )}
          </div>
        )}

        {!isAbsence && event.attachedTaskBadges.length > 0 && (
          <div className="event-chip-badge absolute bottom-1 right-1 flex items-center justify-end gap-1">
            {event.attachedTaskBadges.map((badge) => (
                <TaskIconBadge
                  key={badge.taskId}
                  taskId={badge.taskId}
                  iconId={badge.iconId}
                  label={badge.label}
                  price={badge.price}
                  colorKey={badge.color}
                  priority={badge.priority}
                  priorityEnabled={badge.priorityEnabled}
                  priority_enabled={badge.priority_enabled}
                  status={badge.status}
                  done={badge.done}
                  onEdit={openTaskModal}
                  onDelete={confirmDeleteTask}
                  readOnly={isReadOnly}
              />
            ))}
          </div>
        )}

        {subtitle && <div className={subtitleClass}>{subtitle}</div>}
      </div>
    </div>
  );
};

export default EventCard;
