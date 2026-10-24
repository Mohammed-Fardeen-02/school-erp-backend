export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DD',
  DISPLAY: 'DD/MM/YYYY',
  TIMESTAMP: 'YYYY-MM-DD HH:mm:ss',
} as const;

export const REGEX_PATTERNS = {
  PHONE_NUMBER: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/,
  POSTAL_CODE: /^[A-Z0-9 -]{3,10}$/i,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
} as const;
