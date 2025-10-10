import React from 'react';
import type { DisplayEvent } from '../selectors/planningSelectors';
import TaskIconBadge from './TaskIconBadge';

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

  const title = event.title || event.description || event.client || 'Événement';
  const statusClass = event.status ? ` status-${event.status}` : '';
  const isInteractive = typeof onClick === 'function';

  return (
    <div
      className={`event-chip relative pr-8 pb-5${statusClass}`}
      style={style}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : 'group'}
      tabIndex={0}
      aria-label={`Événement : ${title}`}
      data-testid={`event-${event.id}`}
    >
      <div className="title truncate leading-tight break-words">{title}</div>

      {event.attachedTaskIcons.length > 0 && (
        <div
          className="absolute bottom-1 right-1 flex flex-wrap items-end justify-end gap-1 text-[0]"
          style={{ pointerEvents: 'none' }}
        >
          {event.attachedTaskIcons.map((icon) => (
            <TaskIconBadge
              key={icon.occurrenceId}
              iconId={icon.icon}
              color={icon.color}
              label={icon.label}
            />
          ))}
        </div>
      )}

      {event.client && <div className="subtitle truncate leading-tight break-words">{event.client}</div>}
      {event.description && !event.client && (
        <div className="subtitle truncate break-words leading-tight text-xs text-gray-600">{event.description}</div>
      )}
    </div>
  );
};

export default EventCard;
