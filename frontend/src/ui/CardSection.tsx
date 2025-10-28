import React, { ReactNode } from 'react';
import { radius, surface, accentVariants } from './designTokens';

type CardVariant = 'default' | 'money' | 'warning' | 'note' | 'planning' | 'success';

interface CardSectionProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  variant?: CardVariant;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  'data-testid'?: string;
}

/**
 * CardSection - Composant de carte harmonisé Fleemy v1
 * 
 * Applique une surface commune (fond sombre translucide + bordure claire + arrondi)
 * avec des accents de couleur légers selon le variant.
 * 
 * @example
 * <CardSection 
 *   variant="note" 
 *   icon={<Clock />} 
 *   title="À ne pas oublier"
 *   subtitle="3 notes aujourd'hui"
 * >
 *   {content}
 * </CardSection>
 */
export default function CardSection({
  icon,
  title,
  subtitle,
  variant = 'default',
  children,
  className = '',
  headerAction,
  'data-testid': dataTestId,
}: CardSectionProps) {
  const accent = accentVariants[variant];

  return (
    <div
      data-testid={dataTestId}
      className={`${radius.card} ${surface.card} shadow-sm transition-colors overflow-hidden ${className}`}
    >
      {/* Header avec teinte d'accent légère */}
      <div className={`${accent.headerBg} px-6 py-4 border-b ${accent.borderAccent || 'border-slate-200/10 dark:border-slate-700/20'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`${radius.button} bg-slate-900/40 p-2 ${accent.iconColor}`}>
                {icon}
              </div>
            )}
            <div>
              <h3 className={`text-base font-semibold ${accent.titleColor}`}>
                {title}
              </h3>
              {subtitle && (
                <p className={`text-sm mt-0.5 ${accent.subtitleColor}`}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {headerAction && (
            <div className="flex items-center">
              {headerAction}
            </div>
          )}
        </div>
      </div>

      {/* Contenu */}
      <div className="px-6 py-4">
        {children}
      </div>
    </div>
  );
}
