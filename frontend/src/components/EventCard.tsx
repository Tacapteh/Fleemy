import React from 'react';
import type { DisplayEvent } from '../selectors/planningSelectors';
import TaskIconBadge from './TaskIconBadge';
import { openTaskModal, confirmDeleteTask } from '../store/uiStore';

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
  const isReadOnly = Boolean(event.readOnly);

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

      {event.attachedTaskBadges.length > 0 && (
        <div
          className="absolute bottom-1 right-1 flex flex-wrap items-end justify-end gap-1 text-[0]"
        >
          {event.attachedTaskBadges.map((badge) => (
            <TaskIconBadge
              key={badge.taskId}
              taskId={badge.taskId}
              iconId={badge.iconId}
              label={badge.label}
              price={badge.price}
              onEdit={openTaskModal}
              onDelete={confirmDeleteTask}
              readOnly={isReadOnly}
            />
          ))}
        </div>
      )}

      {event.client && event.client !== title && (
        <div className="subtitle truncate leading-tight break-words">{event.client}</div>
      )}
      {event.description && !event.client && (
        <div className="subtitle truncate break-words leading-tight text-xs text-gray-600">{event.description}</div>
      )}
    </div>
  );
};

export default EventCard;
