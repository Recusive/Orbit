export type CheckCategory = 'binary' | 'credentials' | 'environment';
export type CheckStatus = 'ok' | 'warn' | 'error';

export interface RecoveryAction {
  label: string;
  details?: string;
}

export interface PreflightCheck {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  label: string;
  message: string;
  details?: string;
  recovery?: RecoveryAction;
}

export interface PreflightReport {
  generatedAt: number;
  overallStatus: CheckStatus;
  checks: PreflightCheck[];
}
