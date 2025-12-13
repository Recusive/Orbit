import type { FC } from 'react';

interface HeaderButtonProps {
  readonly icon: FC<{ className?: string }>;
  readonly title: string;
  readonly onClick?: () => void;
}

export const HeaderButton: FC<HeaderButtonProps> = ({ icon: Icon, title, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-accent transition-colors"
      title={title}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};
