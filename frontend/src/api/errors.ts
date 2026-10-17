/** Mirrors the backend's ErrorResponse { code, messages[], timestamp }. */
export interface ErrorResponseDto {
  code: string;
  messages: string[];
  timestamp?: string;
}

export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messages: string[],
    /** Seconds from the Retry-After header, when present and numeric. */
    readonly retryAfter?: number,
  ) {
    super(messages[0] ?? code);
    this.name = "ApiError";
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

/**
 * Turns a non-2xx response into an ApiError. A body that is not the
 * ErrorResponse shape (a proxy's 502 page, say) still yields one, with code
 * UNKNOWN_ERROR and no messages, so callers never have to handle a parse failure.
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
  let code = UNKNOWN_ERROR;
  let messages: string[] = [];
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object") {
      const { code: c, messages: m } = body as Record<string, unknown>;
      if (typeof c === "string") code = c;
      if (Array.isArray(m)) messages = m.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // not JSON; keep the defaults
  }
  if (code === UNKNOWN_ERROR) messages = [];
  return new ApiError(response.status, code, messages, retryAfter);
}

export interface FieldErrors {
  /** First message per form field, keyed by the field name the server used. */
  fields: Record<string, string>;
  /** Messages with no `field:` prefix; show them as a form-level error. */
  form: string[];
}

/**
 * VALIDATION_ERROR messages come as "field: message". Split on the first colon
 * only, since the message itself may contain more. Everything else is form-level.
 */
export function fieldErrors(error: ApiError): FieldErrors {
  const result: FieldErrors = { fields: {}, form: [] };
  for (const message of error.messages) {
    const i = message.indexOf(":");
    const field = i > 0 ? message.slice(0, i).trim() : "";
    if (error.code === "VALIDATION_ERROR" && field !== "" && !/\s/.test(field)) {
      if (!(field in result.fields)) result.fields[field] = message.slice(i + 1).trim();
    } else {
      result.form.push(message);
    }
  }
  return result;
}
