import type { Role } from "./jwt";

/**
 * DTOs of the `/users/me` endpoints. Timestamps are UTC without offset
 * ("2026-10-18T09:05:03.123"), ids are the public unique ids.
 */
export interface UserDto {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

/** Item of `GET /users/me/sessions`, most recently used first. */
export interface SessionDto {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  /** The session's fixed end; refresh does not move it. */
  expiresAt: string;
  /** Null when the client sent none. */
  userAgent: string | null;
  ipAddress: string | null;
  /** The session of the access token that made the call. */
  current: boolean;
}

/** Body of `POST /users/me/password`; 204, and every session ends. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** `DELETE /users/me/sessions`: how many other sessions were ended. */
export interface RevokedSessionsDto {
  revoked: number;
}

/** "2026-10-18T09:05:03.123" to "2026-10-18 09:05". */
export function formatTimestamp(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
