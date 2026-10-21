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
  /** Null until the user sets one; render as text only. */
  displayName: string | null;
}

/** Body of `PATCH /users/me`; trimmed, 1-100 characters, an empty string clears it. */
export interface UpdateMeRequest {
  displayName: string;
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

/**
 * What an admin sees of a user (`GET /users`, `GET /users/{id}`, `PATCH /users/{id}`).
 * Send `version` back on PATCH. `lastModified` is null until the first change.
 */
export interface AdminUserDto {
  id: string;
  username: string;
  role: Role;
  enabled: boolean;
  version: number;
  createdAt: string;
  lastModified: string | null;
  displayName?: string | null;
}

/** One page of `GET /users`, oldest first. `page` is zero-based; `total` counts every match. */
export interface UserListDto {
  users: AdminUserDto[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

/** The server's default page size; it allows 1 to 100, else 400 INVALID_PAGE. */
export const DEFAULT_USER_PAGE_SIZE = 20;

/**
 * Body of `PATCH /users/{id}`. Omitted fields stay as they are, but one of
 * enabled and role is needed (400 EMPTY_PATCH otherwise).
 */
export interface UpdateUserRequest {
  version: number;
  enabled?: boolean;
  role?: Role;
}
