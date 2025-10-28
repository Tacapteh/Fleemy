import React from 'react';

export function MoneyIcon({ className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx={12} cy={12} r={8.25} />
      <path d="M12 6.75v10.5" />
      <path d="M9.75 8.25h3a1.5 1.5 0 0 1 0 3h-1.5a1.5 1.5 0 0 0 0 3h3" />
    </svg>
  );
}
