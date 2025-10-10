import React from 'react';
import type { DisplayEvent } from '../selectors/planningSelectors';

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
      className={`event-chip relative${statusClass}`}
      style={style}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : 'group'}
      tabIndex={0}
      aria-label={`Événement : ${title}`}
      data-testid={`event-${event.id}`}
    >
      <div className="title truncate">{title}</div>

      <div className="relative w-full min-h-[18px]" aria-hidden={event.attachedTaskIcons.length === 0 ? 'true' : undefined}>
        <div className="absolute bottom-1 right-1 flex gap-1 flex-wrap justify-end items-end" style={{ pointerEvents: 'none' }}>
          {event.attachedTaskIcons.map((icon) => (
            <span
              key={icon.occurrenceId}
              className="inline-flex w-[18px] h-[18px] items-center justify-center text-xs"
              style={{ color: icon.color || 'currentColor', backgroundColor: 'transparent' }}
              aria-label={`Task: ${icon.label}`}
              role="img"
              title={icon.label}
            >
              {icon.icon || '📋'}
            </span>
          ))}
        </div>
      </div>

      {event.client && <div className="subtitle truncate">{event.client}</div>}
      {event.description && !event.client && (
        <div className="subtitle truncate text-xs text-gray-600">{event.description}</div>
      )}
    </div>
  );
};

export default EventCard;
