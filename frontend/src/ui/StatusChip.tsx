import React, { ReactNode } from 'react';
import { radius, getStatusChip } from './designTokens';

type StatusKey = 'todo' | 'doing' | 'done';

interface StatusChipProps {
  statusKey: StatusKey;
  label: string;
  srLabel: string;
  icon?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * StatusChip - Capsule de statut cohérente
 * 
 * Utilise les tokens de design pour afficher un statut
 * avec couleurs harmonisées (gris/ambre/vert).
 * 
 * @example
 * <StatusChip 
 *   statusKey="doing"
 *   label="En cours"
 *   srLabel="Tâche en cours"
 *   icon={<Clock className="h-3 w-3" />}
 * />
 */
export default function StatusChip({
  statusKey,
  label,
  srLabel,
  icon,
  className = '',
  'data-testid': dataTestId,
}: StatusChipProps) {
  const tokens = getStatusChip(statusKey);

  return (
    <span
      data-testid={dataTestId}
      className={`inline-flex items-center gap-1 ${radius.chip} px-2 py-0.5 text-xs font-medium border ${tokens.bg} ${tokens.text} ${tokens.border} ${className}`}
      aria-label={srLabel}
    >
      {icon && (
        <span className={tokens.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}
