import React from 'react';

export interface DiffStatsProps {
  additions: number;
  deletions: number;
  className?: string;
}

export const DiffStats: React.FC<DiffStatsProps> = ({
  additions,
  deletions,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-3 text-xs font-medium ${className}`}>
      {additions > 0 && (
        <span className="text-success">+{additions}</span>
      )}
      {deletions > 0 && (
        <span className="text-destructive">-{deletions}</span>
      )}
      {additions === 0 && deletions === 0 && (
        <span className="text-muted-foreground">No changes</span>
      )}
    </div>
  );
};
