import React, { ReactNode } from 'react';
import { text } from './designTokens';

interface SectionHeaderRowProps {
  icon?: ReactNode;
  title: string;
  actionsRight?: ReactNode;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  'data-testid'?: string;
}

/**
 * SectionHeaderRow - Header de section harmonisé
 * 
 * Ligne horizontale avec icône + titre + actions à droite.
 * Typographie et marges cohérentes dans toute l'application.
 * 
 * @example
 * <SectionHeaderRow 
 *   icon={<Calendar className="h-5 w-5" />}
 *   title="Mardi 28"
 *   actionsRight={<button>+ Événement</button>}
 * />
 */
export default function SectionHeaderRow({
  icon,
  title,
  actionsRight,
  className = '',
  iconClassName = 'text-slate-300',
  titleClassName = '',
  'data-testid': dataTestId,
}: SectionHeaderRowProps) {
  return (
    <div
      data-testid={dataTestId}
      className={`flex items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {icon && (
          <div className={`flex-shrink-0 ${iconClassName}`}>
            {icon}
          </div>
        )}
        <h3 className={`text-base font-semibold ${text.primary} tracking-tight ${titleClassName}`}>
          {title}
        </h3>
      </div>
      
      {actionsRight && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actionsRight}
        </div>
      )}
    </div>
  );
}
