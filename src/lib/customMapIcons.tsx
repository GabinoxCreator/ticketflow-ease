import React from 'react';
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };
const baseProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const WcMaleIcon: React.FC<IconProps> = ({ size = 24, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...baseProps} {...props}>
    <circle cx="12" cy="4" r="2" /><line x1="12" y1="6.5" x2="12" y2="15" />
    <line x1="12" y1="9" x2="6" y2="13" /><line x1="12" y1="9" x2="18" y2="13" />
    <line x1="12" y1="15" x2="8" y2="22" /><line x1="12" y1="15" x2="16" y2="22" />
  </svg>
);
export const WcFemaleIcon: React.FC<IconProps> = ({ size = 24, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...baseProps} {...props}>
    <circle cx="12" cy="4" r="2" /><line x1="12" y1="6.5" x2="12" y2="9" />
    <line x1="12" y1="9" x2="6" y2="13" /><line x1="12" y1="9" x2="18" y2="13" />
    <path d="M12 9 L7 16 L17 16 Z" /><line x1="10" y1="16" x2="9" y2="22" /><line x1="14" y1="16" x2="15" y2="22" />
  </svg>
);
