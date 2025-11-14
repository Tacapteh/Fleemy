import React from 'react';

const ExpenseTrendIcon = ({ className = 'h-7 w-7', strokeWidth = 1.8, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M3 6c4 8 8 11 18 14" />
    <path d="M18.5 18.5 21 15.5" />
    <path d="M18.5 18.5 15.5 17" />
  </svg>
);

export default ExpenseTrendIcon;
