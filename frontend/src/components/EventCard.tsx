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

  const explicitTitle = normalizeOptionalString(event.title);
  const clientLabel = resolveClientLabel(event);
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

  const title = explicitTitle || clientLabel || description || 'Événement';
  const statusClass = event.status ? ` status-${event.status}` : '';
  const isInteractive = typeof onClick === 'function';
  const isReadOnly = Boolean(event.readOnly);

  let subtitle = '';
  let subtitleClass = 'subtitle truncate break-words leading-tight text-xs text-gray-600';
  if (clientLabel && clientLabel !== title) {
    subtitle = clientLabel;
    subtitleClass = 'subtitle truncate leading-tight break-words';
  } else if (description && description !== title) {
    subtitle = description;
  }

  return (
    <div
      className={`event-chip${statusClass}`}
      style={style}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : 'group'}
      tabIndex={0}
      aria-label={`Événement : ${title}`}
      data-testid={`event-${event.id}`}
    >
      <div className="event-chip-content relative flex h-full w-full flex-col pr-8 pb-5">
        {timeLabel && (
          <div className="mb-1 text-xs font-semibold leading-tight text-slate-600 dark:text-slate-200">
            {timeLabel}
          </div>
        )}
        <div className="title truncate leading-tight break-words">{title}</div>

        {event.attachedTaskBadges.length > 0 && (
          <div className="event-chip-badge absolute bottom-1 right-1 flex items-center justify-end gap-1">
            {event.attachedTaskBadges.map((badge) => (
              <TaskIconBadge
                key={badge.taskId}
                taskId={badge.taskId}
                iconId={badge.iconId}
                label={badge.label}
                price={badge.price}
                colorKey={badge.color}
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
