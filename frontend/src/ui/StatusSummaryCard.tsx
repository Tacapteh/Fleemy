import React, { ReactNode } from 'react';
import { radius, surface, text } from './designTokens';

interface StatusSummaryCardProps {
  label: string;
  amount: string;
  variant?: 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  'data-testid'?: string;
}

/**
 * StatusSummaryCard - Carte de récapitulatif de statut harmonisée
 * 
 * Utilisée pour afficher les montants financiers avec des couleurs cohérentes.
 * Applique les tokens du design system pour une harmonie visuelle.
 * 
 * @example
 * <StatusSummaryCard 
 *   variant="success"
 *   label="Payé"
 *   amount="1 250 €"
 * />
 */
export default function StatusSummaryCard({
  label,
  amount,
  variant = 'info',
  className = '',
  'data-testid': dataTestId,
}: StatusSummaryCardProps) {
  const variantStyles = {
    success: {
      border: 'border-emerald-200/70 dark:border-emerald-500/40',
      background: 'bg-emerald-50 dark:bg-emerald-500/10',
      accent: 'text-emerald-600 dark:text-emerald-300',
      labelColor: 'text-slate-600 dark:text-slate-300',
    },
    warning: {
      border: 'border-amber-200/70 dark:border-amber-500/30',
      background: 'bg-amber-50 dark:bg-amber-500/10',
      accent: 'text-amber-600 dark:text-amber-300',
      labelColor: 'text-slate-600 dark:text-slate-300',
    },
    danger: {
      border: 'border-rose-200/70 dark:border-rose-500/40',
      background: 'bg-rose-50 dark:bg-rose-500/10',
      accent: 'text-rose-600 dark:text-rose-300',
      labelColor: 'text-slate-600 dark:text-slate-300',
    },
    info: {
      border: 'border-sky-200/70 dark:border-sky-500/40',
      background: 'bg-sky-50 dark:bg-sky-500/10',
      accent: 'text-sky-700 dark:text-sky-300',
      labelColor: 'text-slate-600 dark:text-slate-300',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      data-testid={dataTestId}
      className={`${radius.card} border px-4 py-3 text-sm shadow-md shadow-slate-900/15 transition-colors transition-shadow duration-200 hover:shadow-lg hover:shadow-slate-900/20 ${styles.border} ${styles.background} ${className}`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${styles.labelColor}`}>
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold ${styles.accent}`}>
        {amount}
      </p>
    </div>
  );
}
