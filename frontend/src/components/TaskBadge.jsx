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
  size = 'normal' // 'small', 'normal', 'large'
}) {
  const colorStyles = getTaskColor(task.color);
  const icon = getTaskIcon(task.icon);
  
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
  const ariaLabel = `Tâche ${task.label}, ${startTime} à ${endTime}${task.price ? `, ${task.price}€` : ''}`;
  const title = `${task.label}\n${startTime} - ${endTime}${task.price ? `\n${task.price}€` : ''}`;
  
  // Classes CSS selon la taille
  const sizeClasses = {
    small: 'text-xs px-1 py-0.5',
    normal: 'text-sm px-2 py-1',
    large: 'text-base px-3 py-2'
  };
  
  const iconSizes = {
    small: 'text-xs',
    normal: 'text-sm',
    large: 'text-lg'
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
      <span className={`${iconSizes[size]} flex-shrink-0`} aria-hidden="true">
        {icon}
      </span>
      <span className="truncate min-w-0">
        {task.label}
      </span>
      {task.price && (
        <span className={`${iconSizes[size]} opacity-75 flex-shrink-0`} aria-hidden="true">
          {task.price}€
        </span>
      )}
    </span>
  );
}