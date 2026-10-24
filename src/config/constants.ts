export const APP_CONSTANTS = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
  REQUEST_HEADERS: {
    REQUEST_ID: 'x-request-id',
    SCHOOL_ID: 'x-school-id',
  },
  TOKEN_TYPES: {
    BEARER: 'Bearer',
  },
} as const;
