import React from 'react';

export function UserIcon({ className = '', ...props }) {
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
      <circle cx={12} cy={8.25} r={3.75} />
      <path d="M5.25 19.5a6.75 6.75 0 0 1 13.5 0" />
    </svg>
  );
}
