import React from 'react';

export const PandaIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    {/* Ears */}
    <circle cx="6" cy="6" r="3" fill="currentColor" />
    <circle cx="18" cy="6" r="3" fill="currentColor" />
    
    {/* Face Background */}
    <circle cx="12" cy="13" r="9" fill="currentColor" className="opacity-10" />
    <path d="M12 4C7.02944 4 3 8.02944 3 13C3 17.9706 7.02944 22 12 22C16.9706 22 21 17.9706 21 13C21 8.02944 16.9706 4 12 4Z" stroke="currentColor" strokeWidth="2" />
    
    {/* Eyes */}
    <ellipse cx="8.5" cy="11.5" rx="2.5" ry="3" fill="currentColor" />
    <ellipse cx="15.5" cy="11.5" rx="2.5" ry="3" fill="currentColor" />
    
    {/* Eye Pupils (Inverted color via mask or just distinct color if possible, but for monochrome icon we use simple shapes) */}
    <circle cx="9" cy="11" r="1" fill="white" className="dark:fill-black" />
    <circle cx="15" cy="11" r="1" fill="white" className="dark:fill-black" />
    
    {/* Nose */}
    <ellipse cx="12" cy="15.5" rx="1.5" ry="1" fill="currentColor" />
    
    {/* Mouth */}
    <path d="M10.5 17.5C11 18 13 18 13.5 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
