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
