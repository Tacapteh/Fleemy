import React from 'react';
import { getPriorityChip } from './designTokens';

type Priority = 'high' | 'medium' | 'low';

interface PriorityNumberBadgeProps {
  priority: Priority;
  show?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * PriorityNumberBadge - Badge de priorité avec chiffre
 * 
 * Cercle pastel avec chiffre centré utilisant les tokens du design system.
 * Rouge = 1 (high), Jaune = 2 (medium), Gris = 3 (low)
 * 
 * @example
 * <PriorityNumberBadge priority="high" show={true} />
 */
export default function PriorityNumberBadge({
  priority,
  show = true,
  className = '',
  'data-testid': dataTestId,
}: PriorityNumberBadgeProps) {
  if (!show) {
    return null;
  }

  const tokens = getPriorityChip(priority);

  return (
    <div
      data-testid={dataTestId}
      className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ring-1 ${tokens.bg} ${tokens.text} ${tokens.ring} ${className}`}
      aria-label={`Priorité ${tokens.label}`}
      title={`Priorité ${tokens.label}`}
    >
      {tokens.number}
    </div>
  );
}
