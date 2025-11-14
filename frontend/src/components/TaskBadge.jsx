import React from 'react';
import { getTaskColor } from '../constants/colors';
import { getTaskIcon } from '../constants/icons';

/**
 * Composant pour afficher un badge de tâche avec accessibilité AA
 */
export default function TaskBadge({ 
  task, 
  isReadOnly = false, 
  onClick, 
  className = '',
  size = 'normal', // 'small', 'normal', 'large'
  mode = 'badge' // 'badge' ou 'icon-only'
}) {
  const colorStyles = getTaskColor(task.color);
  const iconSizeClasses = {
    small: 'h-3.5 w-3.5',
    normal: 'h-4 w-4',
    large: 'h-5 w-5'
  };
  const priceTextClasses = {
    small: 'text-xs',
    normal: 'text-sm',
    large: 'text-base'
  };
  
  // Formatage du temps pour l'aria-label
  const formatTime = (date) => {
    if (!(date instanceof Date)) return '';
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  const startTime = formatTime(task.startDate);
  const endTime = formatTime(task.endDate);
  const ariaLabel = `Tâche: ${task.label}${startTime ? `, ${startTime} à ${endTime}` : ''}${task.price ? `, ${task.price}€` : ''}`;
  const title = `${task.label}${startTime ? `\n${startTime} - ${endTime}` : ''}${task.price ? `\n${task.price}€` : ''}`;
  
  // Mode icon-only : badge simple 18x18, transparent, sans texte
  if (mode === 'icon-only') {
    const iconOnlyClasses = `
      inline-flex items-center justify-center
      w-[18px] h-[18px]
      flex-shrink-0
      ${onClick && !isReadOnly ? 'cursor-pointer hover:opacity-70 focus:outline-none focus:ring-1 focus:ring-blue-500' : ''}
      ${className}
    `.trim();
    
    const iconOnlyProps = {
      className: iconOnlyClasses,
      style: {
        color: colorStyles.color,
        fontSize: '14px'
      },
      title: title,
      'aria-label': ariaLabel,
      ...(onClick && !isReadOnly ? {
        role: 'button',
        tabIndex: 0,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(task);
        },
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onClick(task);
          }
        }
      } : {})
    };
    
    return (
      <span {...iconOnlyProps}>
        {getTaskIcon(task.icon, { className: 'h-4 w-4' })}
      </span>
    );
  }
  
  // Mode badge normal (comportement existant)
  const sizeClasses = {
    small: 'text-xs px-1 py-0.5',
    normal: 'text-sm px-2 py-1',
    large: 'text-base px-3 py-2'
  };
  
  const baseClasses = `
    inline-flex items-center gap-1 rounded-md border font-medium
    ${sizeClasses[size]}
    ${onClick && !isReadOnly ? 'cursor-pointer hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500' : ''}
    ${isReadOnly ? 'opacity-75' : ''}
    ${className}
  `.trim();
  
  const badgeProps = {
    className: baseClasses,
    style: {
      backgroundColor: colorStyles.backgroundColor,
      color: colorStyles.color,
      borderColor: colorStyles.borderColor
    },
    title: title,
    'aria-label': ariaLabel,
    ...(onClick && !isReadOnly ? {
      role: 'button',
      tabIndex: 0,
      onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(task);
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick(task);
        }
      }
    } : {
      'aria-hidden': 'true'
    })
  };
  
  return (
    <span {...badgeProps}>
      <span className="flex-shrink-0" aria-hidden="true">
        {getTaskIcon(task.icon, { className: iconSizeClasses[size] })}
      </span>
      <span className="truncate min-w-0">
        {task.label}
      </span>
      {task.price && (
        <span className={`${priceTextClasses[size]} opacity-75 flex-shrink-0`} aria-hidden="true">
          {task.price}€
        </span>
      )}
    </span>
  );
}