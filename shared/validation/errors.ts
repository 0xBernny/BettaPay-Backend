// ─── Standard error response envelope ─────────────────────────────────────────
// Every API error response follows { error: { code, message, details? } } so
// clients can branch on a stable `code` instead of parsing human-readable strings.

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function createErrorResponse(code: string, message: string, details?: unknown): ErrorResponse {
  const error: ErrorResponse['error'] = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { error };
}
