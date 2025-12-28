import config from '../../config';

export const ROLE = {
  CLIENT: 'CLIENT',
  ORGANIZATION: 'ORGANIZATION',
  BUSINESS: 'BUSINESS',
  ADMIN: 'ADMIN',
  GUEST: 'GUEST',
} as const;

export type TRole = keyof typeof ROLE;

export type ValueOf<T> = T[keyof T];

// Generate enum values dynamically from ROLE
export const roleValues = Object.values(ROLE) as [string, ...string[]];

export const defaultUserImage: string = config.defaultUserImage as string;

// Auth Status Constants - moved from organization to auth
export const AUTH_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  SUSPENDED: 'suspended',
} as const;

export type TAuthStatus = (typeof AUTH_STATUS)[keyof typeof AUTH_STATUS];
export const authStatusValues = Object.values(AUTH_STATUS) as [
  string,
  ...string[]
];
