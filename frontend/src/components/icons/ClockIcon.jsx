import React from 'react';

export function ClockIcon({ className = '', ...props }) {
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
      <path d="M12 7.5v4.5l2.25 2.25" />
    </svg>
  );
}
