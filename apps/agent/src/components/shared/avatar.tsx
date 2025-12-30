import { User, Bot } from 'lucide-react';

import type { FC } from 'react';

export interface AvatarProps {
  type: 'user' | 'agent';
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: FC<AvatarProps> = ({ type, name, src, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const bgColor = type === 'agent' ? 'bg-primary' : 'bg-muted';
  const textColor = type === 'agent' ? 'text-primary-foreground' : 'text-muted-foreground';

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? type}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    );
  }

  const Icon = type === 'agent' ? Bot : User;

  return (
    <div
      className={`
        ${sizeClasses[size]}
        ${bgColor}
        ${textColor}
        rounded-full
        flex items-center justify-center
        ${className}
      `}
      title={name}
    >
      <Icon className={iconSizeClasses[size]} />
    </div>
  );
};
