import { create } from 'zustand';

export type AuthStatus = 'unknown' | 'authenticated' | 'expired' | 'no_credentials' | 'error';
export type AuthCredentialType = 'oauth' | 'apikey' | null;
export type AuthErrorCategory = 'NO_CREDENTIALS' | 'REFRESH_FAILED' | 'AUTH_RECOVERED';

export interface AuthState {
  status: AuthStatus;
  credentialType: AuthCredentialType;
  expiresAt: number | null;
  lastError: string | null;
  lastErrorCategory: AuthErrorCategory | null;
  recoverable: boolean;
  setAuthenticated: (
    credentialType: Exclude<AuthCredentialType, null>,
    expiresAt: number | null
  ) => void;
  setExpired: (message: string, recoverable: boolean, expiresAt: number | null) => void;
  setError: (
    category: Exclude<AuthErrorCategory, 'AUTH_RECOVERED'>,
    message: string,
    recoverable: boolean,
    credentialType?: AuthCredentialType
  ) => void;
  setRecovered: (message: string) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  credentialType: null,
  expiresAt: null,
  lastError: null,
  lastErrorCategory: null,
  recoverable: false,

  setAuthenticated: (credentialType, expiresAt) => {
    set({
      status: 'authenticated',
      credentialType,
      expiresAt,
      lastError: null,
      lastErrorCategory: null,
      recoverable: false,
    });
  },

  setExpired: (message, recoverable, expiresAt) => {
    set((state) => ({
      status: 'expired',
      credentialType: state.credentialType ?? 'oauth',
      expiresAt,
      lastError: message,
      lastErrorCategory: 'REFRESH_FAILED',
      recoverable,
    }));
  },

  setError: (category, message, recoverable, credentialType) => {
    set((state) => ({
      status: category === 'NO_CREDENTIALS' ? 'no_credentials' : 'error',
      credentialType: credentialType ?? state.credentialType,
      expiresAt: credentialType === 'apikey' ? null : state.expiresAt,
      lastError: message,
      lastErrorCategory: category,
      recoverable,
    }));
  },

  setRecovered: (message) => {
    set((state) => ({
      status: 'authenticated',
      credentialType: state.credentialType ?? 'oauth',
      expiresAt: state.expiresAt,
      lastError: message,
      lastErrorCategory: 'AUTH_RECOVERED',
      recoverable: false,
    }));
  },

  clearError: () => {
    set((state) => ({
      status: state.credentialType === null ? 'unknown' : 'authenticated',
      lastError: null,
      lastErrorCategory: null,
      recoverable: false,
    }));
  },
}));
