import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import type { FC } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useHealthStore } from '@/stores/health';

export const HealthIndicator: FC = () => {
  const report = useHealthStore((state) => state.report);

  if (report === null) {
    return (
      <div className="flex items-center justify-center h-6 w-6 text-muted-foreground/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }

  const issueCount = report.checks.filter((check) => check.status !== 'ok').length;
  const credentialsIssue = report.checks.find(
    (check) => check.category === 'credentials' && check.status !== 'ok'
  );

  const icon =
    report.overallStatus === 'ok' ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5" />
    );
  const colorClass =
    report.overallStatus === 'ok'
      ? 'text-success'
      : report.overallStatus === 'warn'
        ? 'text-warning'
        : 'text-destructive';
  const summary =
    report.overallStatus === 'ok'
      ? 'Startup checks passed'
      : `${String(issueCount)} startup check${issueCount === 1 ? '' : 's'} need attention`;
  const details =
    credentialsIssue?.message ?? report.checks.find((check) => check.status !== 'ok')?.message;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex items-center justify-center h-6 w-6 rounded-md',
            'transition-colors duration-150',
            colorClass
          )}
          aria-label={summary}
        >
          {icon}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[280px]">
        <div className="space-y-1">
          <p className="text-xs font-medium">{summary}</p>
          {details ? <p className="text-xs text-muted-foreground">{details}</p> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
