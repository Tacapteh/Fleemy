import React from 'react';
import { getPriorityDisplay } from '../utils/priorityDisplay';

export default function PriorityNumberBadge({ priority, show = true }) {
  if (!show) {
    return null;
  }

  const display = getPriorityDisplay(priority);

  if (!display) {
    return null;
  }

  const { labelNumber, ariaLabel, bgClass } = display;

  return (
    <div
      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-1 ring-white/70 ${bgClass}`}
    >
      {labelNumber}
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );
}
