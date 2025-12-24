import { keyof } from 'zod';

export const BANKCONNECTION_PROVIDER = {
  BASIQ: 'basiq',
  PLAID: 'pliad',
};

export const bankConnectiionProviderValues = Object.keys(
  BANKCONNECTION_PROVIDER
);

export type IBankConnectProvider =
  (typeof BANKCONNECTION_PROVIDER)[keyof typeof BANKCONNECTION_PROVIDER];
