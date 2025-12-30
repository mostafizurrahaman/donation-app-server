const AuthLinkLinks = {
  required: ['public', 'self'],
  type: 'object',
  properties: {
    public: {
      type: 'string',
      description: 'Public URL of auth link.',
      examples: ['https://connect.basiq.io/63448be4'],
    },
    self: {
      type: 'string',
      description: 'URL of the resource',
      examples: ['/users/ec4ea48d/auth_link'],
    },
  },
  'x-readme-ref-name': 'AuthLinkLinks',
} as const;

const Source = {
  title: 'Source',
  type: 'object',
  properties: {
    parameter: {
      type: 'string',
      description:
        'String indicating which URI query parameter caused the error.',
      examples: ['id'],
    },
  },
  description: 'An object containing references to the source of the error.',
  'x-readme-ref-name': 'Source',
} as const;

const ResourceLink = {
  title: 'ResourceLink',
  required: ['self'],
  type: 'object',
  properties: {
    self: {
      type: 'string',
      description: 'URL of the resource.',
      examples: ['https://au-api.basiq.io/link/a3dgf4567a89'],
    },
  },
  description: 'Link object containing a link to the resource, self reference.',
  'x-readme-ref-name': 'ResourceLink',
} as const;

const Information = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    attributeList: { type: 'array', items: { type: 'string' } },
  },
  required: ['attributeList', 'description', 'name'],
  title: 'Information',
  'x-readme-ref-name': 'Information',
} as const;

const Primary = {
  type: 'object',
  additionalProperties: false,
  properties: { title: { type: 'string' }, description: { type: 'string' } },
  required: ['description', 'title'],
  title: 'Primary',
  'x-readme-ref-name': 'Primary',
} as const;

const JobsLinks = {
  title: 'JobsLinks',
  required: ['self'],
  type: 'object',
  properties: {
    self: {
      type: 'string',
      description: 'URL of the resource',
      examples: ['https://au-api.basiq.io/jobs/61723'],
    },
    source: {
      type: 'string',
      description:
        'Resource that initiated creation of this Job. For example, for operations on Connection, this is a Connection URL. This is only returned for Connection jobs and not for Statement jobs.',
      examples: ['https://au-api.basiq.io/users/ea3a81/connections/8fce3b'],
    },
  },
  description: 'Links to the resources.',
  'x-readme-ref-name': 'JobsLinks',
} as const;

const JobsResult = {
  title: 'JobsResult',
  type: 'object',
  properties: {
    code: {
      type: 'string',
      description: 'In case of failed job, displays error code.',
      enum: [
        'success',
        'user-action-required',
        'system-unavailable',
        'maintenance',
        'connector-error',
        'institution-not-found',
        'institution-not-available',
        'institution-disabled',
        'missing-required-field',
        'missing-required-field-value',
        'invalid-field-value',
        'invalid-csv-row',
        'row-count-exceeded',
        'account-data-differs',
        'empty-file',
        'bank-statement-invalid',
        'bank-statement-new-product',
        'bank-statement-parsing-error',
        'bank-statement-not-supported',
        'txn-after-last-updated-date',
        'invalid-connection',
        'unknown-error',
        'job-timed-out',
      ],
    },
    details: {
      type: 'string',
      description: 'In case of failed job, displays details of the error.',
    },
    title: {
      type: 'string',
      description: 'In case of failed job, displays error title.',
    },
    type: {
      type: 'string',
      description: 'In case of success, Always "link".',
      examples: ['link'],
    },
    url: {
      type: 'string',
      description:
        'In case of success, URL of the updated (or created) resources.',
    },
  },
  description:
    'Result object containing a list of URLs or null. Otherwise if a step failed contains an error response.',
  'x-readme-ref-name': 'JobsResult',
} as const;

const Job = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    partnerId: { type: 'string' },
    status: { type: 'string' },
    jobType: { type: 'string' },
    applicationId: { type: 'string' },
    created: {
      description:
        'date and time in ISO format of when the job request was created',
      type: 'string',
      format: 'date-time',
    },
    updated: {
      description:
        'date and time in ISO format of when the job request was updated',
      type: 'string',
      format: 'date-time',
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string' },
          result: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              url: { type: 'string' },
              code: { type: 'string' },
              title: { type: 'string' },
              detail: { type: 'string' },
            },
          },
        },
      },
    },
    links: {
      type: 'object',
      properties: {
        link: { type: 'string' },
        self: { type: 'string' },
        source: { type: 'string' },
      },
    },
  },
  'x-readme-ref-name': 'job',
} as const;

const StatementJobs = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    createdDate: {
      description:
        'date and time in ISO format of when the job request was created',
      type: 'string',
      format: 'date-time',
    },
    updatedDate: {
      description:
        'date and time in ISO format of when the job request was updated',
      type: 'string',
      format: 'date-time',
    },
    jobType: { type: 'string' },
    sourceId: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string' },
          result: {
            type: 'object',
            properties: { type: { type: 'string' }, url: { type: 'string' } },
          },
        },
      },
    },
    links: {
      type: 'object',
      properties: {
        link: { type: 'string' },
        self: { type: 'string' },
        source: { type: 'string' },
      },
    },
  },
  'x-readme-ref-name': 'StatementJobs',
} as const;

const ReportsJob = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    partnerId: { type: 'string' },
    applicationId: { type: 'string' },
    created: { type: 'string' },
    updated: { type: 'string' },
    status: { type: 'string' },
    jobType: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string' },
          result: {
            type: 'object',
            properties: { type: { type: 'string' }, url: { type: 'string' } },
          },
        },
      },
    },
    links: {
      type: 'object',
      properties: { self: { type: 'string' }, source: { type: 'string' } },
    },
  },
  'x-readme-ref-name': 'ReportsJob',
} as const;

const GetUserAccountData = {
  title: 'UserGetAccountData',
  required: ['id', 'links', 'type'],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Always "account".',
      examples: ['account'],
    },
    id: {
      type: 'string',
      description: 'Account identification.',
      examples: ['aaaf2c3b'],
    },
    links: ResourceLink,
  },
  description: 'Object containing account data.',
  'x-readme-ref-name': 'GetUserAccountData',
} as const;

const GetUserConnectionData = {
  title: 'GetUserConnectionData',
  required: ['id', 'links', 'type'],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Always "connection".',
      examples: ['connection'],
    },
    id: {
      type: 'string',
      description: 'Connection identification.',
      examples: ['aaaf2c3b'],
    },
    links: ResourceLink,
  },
  description: 'Object containing connection data.',
  'x-readme-ref-name': 'GetUserConnectionData',
} as const;

const GetUserLinks = {
  title: 'GetUserLinks',
  required: ['accounts', 'auth_link', 'connections', 'self', 'transactions'],
  type: 'object',
  properties: {
    accounts: {
      type: 'string',
      description: 'Accounts reference url.',
      examples: ['https://au-api.basiq.io/users/a3dgf4567a89/accounts'],
    },
    connections: {
      type: 'string',
      description: 'Connections reference url.',
      examples: ['https://au-api.basiq.io/users/a3dgf4567a89/connections'],
    },
    self: {
      type: 'string',
      description: 'User self reference url.',
      examples: ['https://au-api.basiq.io/user/a3dgf4567a89'],
    },
    transactions: {
      type: 'string',
      description: 'Transactions reference url.',
      examples: ['https://au-api.basiq.io/users/a3dgf4567a89/transactions'],
    },
  },
  description: 'Object containing links to resources.',
  'x-readme-ref-name': 'GetUserLinks',
} as const;

const EventType = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    id: {
      type: 'string',
      description: 'Identifer of the event type',
      examples: ['user.created'],
    },
    description: {
      type: 'string',
      description: 'a brief description of the event type',
      examples: ['when a user is created'],
    },
    links: { type: 'object', properties: { self: { type: 'string' } } },
  },
  'x-readme-ref-name': 'EventType',
} as const;

const EventsData = {
  required: [
    'createdDate',
    'id',
    'links',
    'type',
    'entity',
    'userId',
    'dataRef',
    'data',
    'eventType',
  ],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type, always "event".',
      examples: ['event'],
    },
    id: {
      type: 'string',
      description: 'Event identification.',
      examples: ['61723'],
    },
    createdDate: {
      type: 'string',
      description: 'Date the event was created.',
      examples: ['2019-07-29T07:34:09Z'],
    },
    entity: {
      type: 'string',
      description: 'The entity associated with the event that has occurred',
      enum: ['consent', 'connection'],
      examples: ['consent'],
    },
    eventType: {
      type: 'string',
      description: 'The type of event that has occurred',
      enum: ['revoked', 'expired', 'updated', 'created', 'archived', 'deleted'],
      examples: ['revoked'],
    },
    userId: {
      type: 'string',
      description: 'The identifier of the user the event belongs to.',
      examples: ['266f5849-6ef6-4aae-accf-386470d0598e'],
    },
    dataRef: {
      type: 'string',
      description: 'URL to the data source the event occurred.',
      examples: [
        'https://au-api.basiq.io/users/266f5849-6ef6-4aae-accf-386470d0598e',
      ],
    },
    data: {
      type: 'string',
      description: 'The data associated with the event that has been created.',
    },
    links: {},
  },
  'x-readme-ref-name': 'EventsData',
} as const;

const Permission = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scope: { type: 'string' },
    required: { type: 'boolean' },
    consented: { type: 'boolean' },
    entity: { type: 'string' },
    information: Information,
    purpose: Primary,
  },
  required: ['entity', 'information', 'purpose', 'required', 'scope'],
  title: 'Permission',
  'x-readme-ref-name': 'Permission',
} as const;

const Purpose = {
  type: 'object',
  additionalProperties: false,
  properties: { primary: Primary, other: { type: 'boolean' } },
  required: ['primary'],
  title: 'Purpose',
  'x-readme-ref-name': 'Purpose',
} as const;

const Data = {
  type: 'object',
  additionalProperties: false,
  properties: {
    retainData: { type: 'boolean' },
    initialRetrievalDays: { type: 'integer' },
    organisation: { type: 'boolean' },
    permissions: { type: 'array', items: Permission },
  },
  required: ['permissions', 'retainData'],
  title: 'Data',
  'x-readme-ref-name': 'Data',
} as const;

const UserConsentGetResponses = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string' },
    id: { type: 'string', format: 'uuid' },
    created: { type: 'string', format: 'date-time' },
    updated: { type: 'string', format: 'date-time' },
    expiryDate: { type: 'string', format: 'date-time' },
    origin: { type: 'string' },
    status: { type: 'string', description: 'active, revoked, and expired' },
    purpose: Purpose,
    data: Data,
    revoked: {
      type: 'string',
      description: 'To indicate when a user consent was revoked.',
    },
    links: {
      type: 'object',
      properties: {
        self: { type: 'string' },
        consentPolicy: { type: 'string' },
        latestConsentPolicy: { type: 'string' },
      },
    },
  },
  required: [
    'created',
    'data',
    'expiryDate',
    'id',
    'purpose',
    'status',
    'type',
    'updated',
  ],
  title: 'UserConsentGetResponse',
  'x-readme-ref-name': 'UserConsentGetResponses',
} as const;

const JobsInstitution = {
  title: 'Institution',
  required: ['id', 'links', 'type'],
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'A string that uniquely identifies institution.',
      examples: ['AU00000'],
    },
    links: JobsLinks,
    type: {
      type: 'string',
      description: 'Always "institution".',
      examples: ['institution'],
    },
  },
  description: 'Institution details.',
  'x-readme-ref-name': 'JobsInstitution',
} as const;

const JobsStep = {
  title: 'JobsStep',
  required: ['result', 'status'],
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Name of the step the job needs to complete.',
      enum: [
        'verify-credentials',
        'retrieve-accounts',
        'retrieve-transactions',
        'retrieve-statements',
      ],
      examples: ['retrieve-accounts'],
    },
    status: {
      type: 'string',
      description: 'Status of the job step',
      enum: ['pending', 'in-progress', 'success', 'failed'],
      examples: ['success'],
    },
    result: JobsResult,
  },
  description: 'List of steps that need to be completed.',
  'x-readme-ref-name': 'JobsStep',
} as const;

const JobsData = {
  title: 'JobsData',
  required: ['created', 'id', 'institution', 'steps', 'updated'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Value is "job".', examples: ['job'] },
    id: {
      type: 'string',
      description: 'A string that uniquely identifies the job.',
      examples: ['e9132638'],
    },
    created: {
      type: 'string',
      description: 'The date time when the job was created.',
      examples: ['2020-06-10T09:59:00Z'],
    },
    updated: {
      type: 'string',
      description: 'The date time when the job was last updated.',
      examples: ['2020-06-10T09:59:00Z'],
    },
    institution: JobsInstitution,
    steps: {
      type: 'array',
      description: 'List of steps that need to be completed.',
      items: JobsStep,
    },
    links: JobsLinks,
  },
  description: 'Container object, containing job details.',
  'x-readme-ref-name': 'JobsData',
} as const;

const GetUserAccount = {
  title: 'UserGetAccount',
  required: ['count', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    count: {
      type: 'integer',
      description: 'Count of accounts.',
      format: 'int64',
      examples: [7],
      minimum: -9223372036854776000,
      maximum: 9223372036854776000,
    },
    data: {
      type: 'array',
      description: 'Accounts data.',
      items: GetUserAccountData,
    },
  },
  description: 'Container object containing account data.',
  'x-readme-ref-name': 'GetUserAccount',
} as const;

const GetUserConnection = {
  title: 'UserGetConnection',
  required: ['count', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    count: {
      type: 'integer',
      description: 'Count of accounts.',
      format: 'int64',
      examples: [5],
      minimum: -9223372036854776000,
      maximum: 9223372036854776000,
    },
    data: {
      type: 'array',
      description: 'Connections data.',
      items: GetUserConnectionData,
    },
  },
  description: 'Container object containing connection data.',
  'x-readme-ref-name': 'GetUserConnection',
} as const;

const UserGetResponse = {
  title: 'UserGetResponse',
  required: [
    'accounts',
    'connections',
    'email',
    'id',
    'links',
    'mobile',
    'name',
    'firstName',
    'middleName',
    'lastName',
    'type',
  ],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "user".', examples: ['user'] },
    id: {
      type: 'string',
      description: 'User identification.',
      examples: ['ea3a81'],
    },
    email: {
      type: 'string',
      description: 'User email or empty.',
      format: 'email',
      examples: ['gavin@hooli.com'],
    },
    mobile: {
      type: 'string',
      description: 'User mobile number, or empty.',
      examples: [61410888666],
    },
    name: { type: 'string', description: 'Name, or empty.', examples: [''] },
    firstName: {
      type: 'string',
      description: 'firstName, or empty',
      examples: ['Gavin'],
    },
    middleName: {
      type: 'string',
      description: 'middleName, or empty',
      examples: ['middleName'],
    },
    lastName: {
      type: 'string',
      description: 'lastName, or empty',
      examples: ['lastName'],
    },
    businessName: {
      type: 'string',
      description: 'The official name of the business.',
      examples: ['Manly Accounting PTY LTD'],
    },
    businessIdNo: {
      type: 'string',
      description:
        'This number is used to identify a business when they’re dealing with the government, other businesses, and the public.',
      examples: ['16 7645 892'],
    },
    businessIdNoType: {
      type: 'string',
      description: 'Type of business ID could be ABN Or ACN.',
      enum: ['ABN', 'ACN'],
      examples: ['ABN'],
    },
    businessAddress: {
      type: 'object',
      properties: {
        addressLine1: {
          type: 'string',
          description: 'The first line of the business address.',
          examples: ['21 Sydney Rd'],
        },
        addressLine2: {
          type: 'string',
          description:
            'Additional information about the business address (optional).',
          examples: [''],
        },
        suburb: {
          type: 'string',
          description: 'The suburb or locality where the business is located.',
          examples: ['Manly'],
        },
        state: {
          type: 'string',
          description: 'The state or territory where the business is located.',
          examples: ['NSW'],
        },
        postcode: {
          type: 'string',
          description: 'The postal code of the business location.',
          examples: ['2095'],
        },
        countryCode: {
          type: 'string',
          description: 'The country code of the business location.',
          examples: ['AUS'],
        },
      },
    },
    verificationStatus: {
      type: 'boolean',
      description:
        'Indicates if the business information provided is verified against the Australian Business Register.',
    },
    verificationDate: {
      type: 'string',
      description: 'when the verification was done.',
      examples: ['12/01/2024'],
    },
    connections: GetUserConnection,
    accounts: GetUserAccount,
    links: GetUserLinks,
  },
  description: 'User object with details if the creation succeeded.',
  'x-readme-ref-name': 'UserGetResponse',
} as const;

const AuthLinksPostResponseResource = {
  required: ['mobile', 'type', 'userId', 'expiresAt'],
  type: 'object',
  properties: {
    mobile: {
      type: 'string',
      description: "A user's mobile phone, used as for authentication.",
      examples: [61410000000],
    },
    type: {
      type: 'string',
      description: 'Type of the response, always "auth_link".',
      examples: ['auth_link'],
    },
    userId: {
      type: 'string',
      description: 'A string that uniquely identifies the user.',
      examples: ['ec4ea48d'],
    },
    expiresAt: {
      type: 'string',
      description: 'The date time of auth link expiry.',
      examples: ['2019-11-21T04:08:50Z'],
    },
    links: AuthLinkLinks,
  },
  'x-readme-ref-name': 'AuthLinksPostResponseResource',
} as const;

const AuthLinksResponseResource = {
  required: ['id', 'mobile', 'type', 'expiresAt', 'userId'],
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Uniquely identifies the auth link.',
      examples: ['63448be4'],
    },
    mobile: {
      type: 'string',
      description: "A user's mobile phone, used as for authentication.",
      examples: [61410000000],
    },
    type: {
      type: 'string',
      description: 'Type of the response, always "auth_link".',
      examples: ['auth_link'],
    },
    userId: {
      type: 'string',
      description: 'A string that uniquely identifies the user.',
      examples: ['ec4ea48d'],
    },
    expiresAt: {
      type: 'string',
      description: 'The date time of auth link expiry.',
      examples: ['2019-11-21T04:08:50Z'],
    },
    links: AuthLinkLinks,
  },
  'x-readme-ref-name': 'AuthLinksResponseResource',
} as const;

const BadRequestError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'type'],
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
          title: {
            type: 'string',
            description: 'Title of the error',
            examples: ['Parameter not valid.'],
          },
          code: {
            type: 'string',
            description:
              'Application-specific error code, expressed as a string value.',
            enum: [
              'parameter-not-supplied',
              'parameter-not-valid',
              'unsupported-accept',
              'invalid-content',
              'institution-not-supported',
              'invalid-credentials',
            ],
            examples: ['parameter-not-valid'],
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
            examples: ['ID value is not valid.'],
          },
          source: Source,
        },
      },
    },
  },
  'x-readme-ref-name': 'BadRequestError',
} as const;

const ConnectionResponseResource = {
  title: 'ConnectionResponseResource',
  required: ['id', 'links', 'type'],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type, always "job".',
      examples: ['job'],
    },
    id: {
      type: 'string',
      description: 'Job identification.',
      examples: ['29523951'],
    },
    links: ResourceLink,
  },
  description: 'Object containing details for connection post.',
  'x-readme-ref-name': 'ConnectionResponseResource',
} as const;

const CreateUser = {
  type: 'object',
  properties: {
    email: {
      type: 'string',
      description:
        'The end-users email address. Mandatory if mobile is not supplied.',
      examples: ['gavin@hooli.com'],
    },
    mobile: {
      type: 'string',
      description:
        'The end-users mobile number, supplied in international format. +[country-code][mobileno]. Mandatory if email is not supplied.',
      examples: ['+61410888999'],
    },
    firstName: {
      type: 'string',
      description:
        'The end-users first name as an optional additional parameter.',
      examples: ['Gavin'],
    },
    middleName: {
      type: 'string',
      description:
        'The end-users middle name as an optional additional parameter.',
      examples: ['middle name'],
    },
    lastName: {
      type: 'string',
      description:
        'The end-users last name as an optional additional parameter.',
      examples: ['Belson'],
    },
    businessName: {
      type: 'string',
      description: 'The official name of the business.',
      examples: ['Manly Accounting PTY LTD'],
    },
    businessIdNo: {
      type: 'string',
      description:
        'This number is used to identify a business when they’re dealing with the government, other businesses, and the public.',
      examples: ['16 7645 892'],
    },
    businessIdNoType: {
      type: 'string',
      description: 'Type of business ID could be ABN Or ACN.',
      enum: ['ABN', 'ACN'],
      examples: ['ABN'],
    },
    businessAddress: {
      type: 'object',
      properties: {
        addressLine1: {
          type: 'string',
          description: 'The first line of the business address.',
          examples: ['21 Sydney Rd'],
        },
        addressLine2: {
          type: 'string',
          description:
            'Additional information about the business address (optional).',
          examples: [''],
        },
        suburb: {
          type: 'string',
          description: 'The suburb or locality where the business is located.',
          examples: ['Manly'],
        },
        state: {
          type: 'string',
          description: 'The state or territory where the business is located.',
          examples: ['NSW'],
        },
        postcode: {
          type: 'string',
          description: 'The postal code of the business location.',
          examples: ['2095'],
        },
        countryCode: {
          type: 'string',
          description: 'The country code of the business location.',
          examples: ['AUS'],
        },
      },
    },
    verificationStatus: {
      type: 'boolean',
      description:
        'Indicates if the business information provided is verified against the Australian Business Register.',
    },
    verificationDate: {
      type: 'string',
      description: 'when the verification was done.',
      examples: ['12/01/2024'],
    },
  },
  'x-readme-ref-name': 'createUser',
} as const;

const DeleteAuthLink = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the user.',
          },
        },
        required: ['userId'],
      },
    ],
  },
} as const;

const DeleteConsent = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'User identification.',
          },
          consentId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'Consent identification.',
          },
        },
        required: ['userId', 'consentId'],
      },
    ],
  },
} as const;

const DeleteUser = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'User identification.',
          },
        },
        required: ['userId'],
      },
    ],
  },
} as const;

const Error = {
  properties: {
    type: { type: 'string' },
    correlationId: { type: 'string' },
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          code: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
          source: {
            type: 'object',
            properties: { parameter: { type: 'string' } },
          },
        },
      },
    },
  },
  'x-readme-ref-name': 'Error',
  type: 'object',
} as const;

const EventTypes = {
  properties: {
    type: { type: 'string' },
    count: { type: 'integer' },
    size: { type: 'integer' },
    data: {
      type: 'array',
      description:
        'one or more events that the webhook would send messages for.',
      items: EventType,
    },
    links: {
      type: 'object',
      properties: { self: { type: 'string' }, next: { type: 'string' } },
    },
  },
  'x-readme-ref-name': 'EventTypes',
  type: 'object',
} as const;

const EventsGetResponseResource = {
  title: 'EventsGetResponseResource',
  required: ['type'],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type, always "list".',
      examples: ['list'],
    },
    data: { type: 'array', items: EventsData },
    links: ResourceLink,
  },
  description: 'Object containing details for connections.',
  'x-readme-ref-name': 'EventsGetResponseResource',
} as const;

const ForbiddenAccessError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'source', 'type'],
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
          title: {
            type: 'string',
            description: 'Title of the error',
            examples: ['Forbidden Access'],
          },
          code: {
            type: 'string',
            description:
              'Application-specific error code, expressed as a string value.',
            enum: ['forbidden-access', 'no-production-access', 'access-denied'],
            examples: ['forbidden-access'],
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
            examples: ['Access to this resource is forbidden.'],
          },
          source: Source,
        },
      },
    },
  },
  'x-readme-ref-name': 'ForbiddenAccessError',
} as const;

const GetAuthLink = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the user.',
          },
        },
        required: ['userId'],
      },
    ],
  },
} as const;

const GetConsents = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the user',
          },
        },
        required: ['userId'],
      },
    ],
  },
  response: {
    '200': {
      type: 'object',
      properties: {
        type: { type: 'string', examples: ['list'] },
        size: { type: 'integer', examples: [2] },
        data: { type: 'array', items: UserConsentGetResponses },
        links: {
          type: 'object',
          properties: {
            self: {
              type: 'string',
              examples: [
                'https://au-api.basiq.io/users/79ce620b-e7a6-4d49-8053-e5a0acfbbb77/consents',
              ],
            },
          },
        },
      },
      $schema: 'http://json-schema.org/draft-04/schema#',
    },
  },
} as const;

const GetEventTypeById = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            examples: ['user.created'],
            $schema: 'http://json-schema.org/draft-04/schema#',
          },
        },
        required: ['id'],
      },
    ],
  },
} as const;

const GetEvents = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            examples: [
              'user.id.eq(userId) OR event.entity.eq(entity), event.type.eq(type)',
            ],
            $schema: 'http://json-schema.org/draft-04/schema#',
            description:
              'Retrieves the details of all events associated with a user.\n\n**Note:** This endpoint only returns events that happened in the last 7 days.\n\n**Filtering Options:**\n- `userId`: User ID for the specific user you wish to retrieve events for. e.g., `user.id.eq(userId)`\n- `entity`: Filter events by entity type. e.g., `event.entity.eq(entity)`\n- `type`: Filter events by event type. e.g., `event.type.eq(type)`\n',
          },
        },
        required: [],
      },
    ],
  },
} as const;

const GetJobs = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the job to be retrieved.',
          },
        },
        required: ['jobId'],
      },
    ],
  },
  response: {
    '200': {
      oneOf: [Job, StatementJobs, ReportsJob],
      $schema: 'http://json-schema.org/draft-04/schema#',
    },
  },
} as const;

const GetTypeById = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            examples: [
              'a0fa1d01e0c9a1032e29ac74ade5f786e880ae04f4e3788144c6d13b53e5d29b',
            ],
            $schema: 'http://json-schema.org/draft-04/schema#',
          },
        },
        required: ['id'],
      },
    ],
  },
} as const;

const GetUser = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the user to be retrieved.',
          },
        },
        required: ['userId'],
      },
    ],
  },
} as const;

const GetUserJobs = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'User identifier',
          },
        },
        required: ['userId'],
      },
      {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description:
              "Connection identification filter. e.g. connection.id.eq('ab63cd')",
          },
        },
        required: [],
      },
    ],
  },
} as const;

const GoneError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'type'],
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'Application-specific error code, expressed as a string value.',
            enum: ['resource-no-longer-available'],
            examples: ['resource-no-longer-available'],
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
          },
          title: { type: 'string', description: 'Title of the error' },
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
        },
      },
    },
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
  },
  'x-readme-ref-name': 'GoneError',
} as const;

const InternalServerError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'type'],
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'Application-specific error code, expressed as a string value.',
            enum: ['internal-server-error'],
            examples: ['internal-server-error'],
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
            examples: ['Internal Server error. Contact support.'],
          },
          title: {
            type: 'string',
            description: 'Title of the error',
            examples: ['Internal Server error.'],
          },
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
        },
      },
    },
  },
  'x-readme-ref-name': 'InternalServerError',
} as const;

const JobPostRequest = {
  required: ['mfa-response'],
  type: 'object',
  properties: {
    'mfa-response': {
      type: 'array',
      description:
        'One time password or answer to a security question/s e.g. ["1234"]',
      items: { type: 'string' },
      examples: ['1234'],
    },
  },
  'x-readme-ref-name': 'JobPostRequest',
} as const;

const JobsResponseResource = {
  required: ['data', 'links', 'size', 'type'],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type of the response, always "list".',
      examples: ['list'],
    },
    data: {
      type: 'array',
      description: 'Container object, containing job details.',
      items: JobsData,
    },
    size: {
      type: 'integer',
      description: 'Size of the all the jobs.',
      format: 'int64',
      examples: [100],
      minimum: -9223372036854776000,
      maximum: 9223372036854776000,
    },
    links: ResourceLink,
  },
  'x-readme-ref-name': 'JobsResponseResource',
} as const;

const NotFoundError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'type'],
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'Application-specific error code, expressed as a string value.',
            enum: ['resource-not-found'],
            examples: ['resource-not-found'],
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
            examples: ['Resource not found.'],
          },
          title: {
            type: 'string',
            description: 'Title of the error',
            examples: ['Requested resource is not found.'],
          },
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
        },
      },
    },
  },
  'x-readme-ref-name': 'NotFoundError',
} as const;

const PostAuthLink = {
  body: {
    type: 'object',
    properties: { mobile: { type: 'string' } },
    $schema: 'http://json-schema.org/draft-04/schema#',
  },
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
          },
        },
        required: ['userId'],
      },
    ],
  },
} as const;

const PostJobMfa = {
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the job.',
          },
        },
        required: ['jobId'],
      },
    ],
  },
} as const;

const PostToken = {
  formData: {
    properties: {
      scope: { type: 'string', examples: ['CLIENT_ACCESS'] },
      userId: { type: 'string' },
    },
    type: 'object',
    $schema: 'http://json-schema.org/draft-04/schema#',
  },
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          'basiq-version': {
            type: 'string',
            examples: ['3.0'],
            $schema: 'http://json-schema.org/draft-04/schema#',
          },
        },
        required: ['basiq-version'],
      },
    ],
  },
} as const;

const RetrieveEvent = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    createdDate: { type: 'string' },
    entity: { type: 'string' },
    eventType: { type: 'string' },
    userId: { type: 'string' },
    dataRef: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        createdDate: { type: 'string' },
        id: { type: 'string' },
        institution: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            links: { type: 'object', properties: { self: { type: 'string' } } },
            type: { type: 'string' },
          },
        },
        lastUsed: { type: 'string' },
        links: {
          type: 'object',
          properties: {
            accounts: { type: 'string' },
            self: { type: 'string' },
            transactions: { type: 'string' },
          },
        },
        mfaEnabled: { type: 'boolean' },
        status: { type: 'string' },
        type: { type: 'string' },
      },
    },
    links: { type: 'object', properties: { self: { type: 'string' } } },
  },
  'x-readme-ref-name': 'RetrieveEvent',
} as const;

const StatusServiceUnavailableError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'type'],
        type: 'object',
        properties: {
          code: {
            type: 'object',
            description:
              'Application-specific error code, expressed as a string value.',
            examples: ['service-unavailable'],
            additionalProperties: true,
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
            examples: ['Service Unavailable. Try again later.'],
          },
          title: {
            type: 'string',
            description: 'Title of the error',
            examples: ['Service Unavailable'],
          },
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
        },
      },
    },
  },
  'x-readme-ref-name': 'StatusServiceUnavailableError',
} as const;

const TokenPostResponse = {
  required: ['access_token', 'expires_in', 'token_type'],
  type: 'object',
  properties: {
    access_token: {
      type: 'string',
      description: 'The generated access token.',
      examples: [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      ],
    },
    expires_in: {
      type: 'integer',
      description: 'Expires in 3600 seconds',
      format: 'int64',
      examples: [3600],
      minimum: -9223372036854776000,
      maximum: 9223372036854776000,
    },
    token_type: {
      type: 'string',
      description: 'This value will always be `Bearer`.',
      examples: ['Bearer'],
    },
  },
  'x-readme-ref-name': 'TokenPostResponse',
} as const;

const UnauthorizedError = {
  required: ['correlationId', 'data', 'type'],
  type: 'object',
  properties: {
    correlationId: {
      type: 'string',
      description:
        'Unique identifier for this particular occurrence of the problem.',
      examples: ['ac5ah5i'],
    },
    data: {
      type: 'array',
      description: 'Error data.',
      items: {
        required: ['code', 'type'],
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'Application-specific error code, expressed as a string value.',
            enum: ['unauthorized-access', 'invalid-authorization-token'],
            examples: ['unauthorized-access'],
          },
          detail: {
            type: 'string',
            description:
              'Human-readable explanation specific to this occurrence of the problem.',
            examples: ['You are not authorized to access this resource'],
          },
          title: {
            type: 'string',
            description: 'Title of the error',
            examples: ['Unauthorized Access'],
          },
          type: {
            type: 'string',
            description: 'Type of the response, always "error"',
            examples: ['error'],
          },
        },
      },
    },
    type: { type: 'string', description: 'Always "list".', examples: ['list'] },
  },
  'x-readme-ref-name': 'UnauthorizedError',
} as const;

const UpdateUser = {
  type: 'object',
  properties: {
    email: {
      type: 'string',
      description: 'The end-users email address.',
      examples: ['gavin@hooli.com'],
    },
    mobile: {
      type: 'string',
      description: 'The end-users mobile number.',
      examples: ['+61410888666'],
    },
    firstName: {
      type: 'string',
      description:
        'The end-users first name as an optional additional parameter.',
      examples: ['Malcolm'],
    },
    middleName: {
      type: 'string',
      description:
        'The end-users middle name as an optional additional parameter.',
      examples: ['Malcom middle name'],
    },
    lastName: {
      type: 'string',
      description:
        'The end-users last name as an optional additional parameter.',
      examples: ['Malcolm last name'],
    },
  },
  'x-readme-ref-name': 'updateUser',
  metadata: {
    allOf: [
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            $schema: 'http://json-schema.org/draft-04/schema#',
            description: 'The identifier of the user to be retrieved.',
          },
        },
        required: ['userId'],
      },
    ],
  },
} as const;

const UserPostResponse = {
  title: 'UserPostResponse',
  required: ['id', 'links', 'mobile', 'type'],
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type of the response, always "user".',
      examples: ['user'],
    },
    id: {
      type: 'string',
      description: 'A string that uniquely identifies the user.',
      examples: ['e1956419'],
    },
    email: {
      type: 'string',
      description: 'The end-users email address.',
      format: 'email',
      examples: ['gavin@hooli.com'],
    },
    mobile: {
      type: 'string',
      description: 'The end-users mobile number.',
      examples: [61410888999],
    },
    firstName: {
      type: 'string',
      description:
        'The end-users first name as an optional additional parameter.',
      examples: ['Gavin'],
    },
    middleName: {
      type: 'string',
      description:
        'The end-users middle name as an optional additional parameter.',
      examples: ['middle name'],
    },
    lastName: {
      type: 'string',
      description:
        'The end-users last name as an optional additional parameter.',
      examples: ['Belson'],
    },
    businessName: {
      type: 'string',
      description: 'The official name of the business.',
      examples: ['Manly Accounting PTY LTD'],
    },
    businessIdNo: {
      type: 'string',
      description:
        'This number is used to identify a business when they’re dealing with the government, other businesses, and the public.',
      examples: ['16 7645 892'],
    },
    businessIdNoType: {
      type: 'string',
      description: 'Type of business ID could be ABN Or ACN.',
      enum: ['ABN', 'ACN'],
      examples: ['ABN'],
    },
    businessAddress: {
      type: 'object',
      properties: {
        addressLine1: {
          type: 'string',
          description: 'The first line of the business address.',
          examples: ['21 Sydney Rd'],
        },
        addressLine2: {
          type: 'string',
          description:
            'Additional information about the business address (optional).',
          examples: [''],
        },
        suburb: {
          type: 'string',
          description: 'The suburb or locality where the business is located.',
          examples: ['Manly'],
        },
        state: {
          type: 'string',
          description: 'The state or territory where the business is located.',
          examples: ['NSW'],
        },
        postcode: {
          type: 'string',
          description: 'The postal code of the business location.',
          examples: ['2095'],
        },
        countryCode: {
          type: 'string',
          description: 'The country code of the business location.',
          examples: ['AUS'],
        },
      },
    },
    verificationStatus: {
      type: 'boolean',
      description:
        'Indicates if the business information provided is verified against the Australian Business Register.',
    },
    verificationDate: {
      type: 'string',
      description: 'when the verification was done.',
      examples: ['12/01/2024'],
    },
    links: ResourceLink,
  },
  description: 'User object with details if the creation succeeded.',
  'x-readme-ref-name': 'UserPostResponse',
} as const;

export {
  AuthLinkLinks,
  AuthLinksPostResponseResource,
  AuthLinksResponseResource,
  BadRequestError,
  ConnectionResponseResource,
  CreateUser,
  Data,
  DeleteAuthLink,
  DeleteConsent,
  DeleteUser,
  Error,
  EventType,
  EventTypes,
  EventsData,
  EventsGetResponseResource,
  ForbiddenAccessError,
  GetAuthLink,
  GetConsents,
  GetEventTypeById,
  GetEvents,
  GetJobs,
  GetTypeById,
  GetUser,
  GetUserAccount,
  GetUserAccountData,
  GetUserConnection,
  GetUserConnectionData,
  GetUserJobs,
  GetUserLinks,
  GoneError,
  Information,
  InternalServerError,
  Job,
  JobPostRequest,
  JobsData,
  JobsInstitution,
  JobsLinks,
  JobsResponseResource,
  JobsResult,
  JobsStep,
  NotFoundError,
  Permission,
  PostAuthLink,
  PostJobMfa,
  PostToken,
  Primary,
  Purpose,
  ReportsJob,
  ResourceLink,
  RetrieveEvent,
  Source,
  StatementJobs,
  StatusServiceUnavailableError,
  TokenPostResponse,
  UnauthorizedError,
  UpdateUser,
  UserConsentGetResponses,
  UserGetResponse,
  UserPostResponse,
};
