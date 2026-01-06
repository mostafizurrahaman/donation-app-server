export const ORGANIZATION_STATUS = {
  ACTIVE: 'active',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
};

export const ORGANIZATION_SERVICE_TYPES = {
  NON_PROFIT: 'non-profit',
  CHARITY: 'charity',
  MOSQUE: 'mosque',
};

export const STRIPE_ACCOUNT_STATUS = {
  NOT_CONNECTED: 'not_connected',
  PENDING: 'pending',
  ACTIVE: 'active',
  RESTRICTED: 'restricted',
} as const;

export const searchableFields = [
  'name',
  'aboutUs',
  'serviceType',
  'address',
  'registeredCharityName',
  'tfnOrAbnNumber',
  'boardMemberName',
  'boardMemberEmail',
  'website',
  'country',
  'state',
  'postalCode',
  'phoneNumber',
];
export const organizationStatusValues = Object.values(ORGANIZATION_STATUS);
export const organizationServiceTypeValues = Object.values(
  ORGANIZATION_SERVICE_TYPES
);
export const STRIPE_ACCOUNT_STATUS_VALUES = Object.values(
  STRIPE_ACCOUNT_STATUS
);
