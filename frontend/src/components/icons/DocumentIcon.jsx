import React from 'react';

export function DocumentIcon({ className = '', ...props }) {
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
      <path d="M9 3.75H5.25A2.25 2.25 0 0 0 3 6v12A2.25 2.25 0 0 0 5.25 20.25h13.5A2.25 2.25 0 0 0 21 18V9.75L14.25 3.75H9z" />
      <path d="M14.25 3.75V9h5.25" />
      <path d="M8.25 12.75h7.5" />
      <path d="M8.25 15.75h6" />
    </svg>
  );
}
