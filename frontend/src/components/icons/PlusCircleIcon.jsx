import React from 'react';

export function PlusCircleIcon({ className = '', ...props }) {
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
      <path d="M12 8.25v7.5" />
      <path d="M8.25 12h7.5" />
    </svg>
  );
}
