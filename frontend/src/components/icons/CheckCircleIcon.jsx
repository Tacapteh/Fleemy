import React from 'react';

export function CheckCircleIcon({ className = '', ...props }) {
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
      <path d="M8.25 12.75 10.5 15l5.25-5.25" />
    </svg>
  );
}
