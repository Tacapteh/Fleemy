import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { getIcon } from '../icons/registry';

interface TaskIconBadgeProps {
  iconId?: string | null;
  label?: string | null;
  color?: string | null;
}

const TaskIconBadge: React.FC<TaskIconBadgeProps> = ({ iconId, label, color }) => {
  const IconComponent: LucideIcon = getIcon(iconId);

  return (
    <span
      className="inline-flex h-[18px] w-[18px] items-center justify-center"
      style={{ color: color || 'currentColor', backgroundColor: 'transparent' }}
      aria-label={label ? `Tâche : ${label}` : undefined}
      role="img"
      title={label || undefined}
    >
      <IconComponent className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden={label ? undefined : true} />
    </span>
  );
};

export default TaskIconBadge;

