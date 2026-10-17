/**
 * Reads who is signed in from the access token's payload, for display only:
 * the signature is not checked here, and the server stays the authority on
 * what the user may do. Hiding an admin link is not security.
 */

export type Role = "USER" | "ADMIN";

export interface Identity {
  /** The `sub` claim. */
  username: string;
  /** The `role` claim; null when it is neither USER nor ADMIN. */
  role: Role | null;
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The identity in a JWT, or null when the token is malformed or has no `sub`. */
export function decodeIdentity(token: string): Identity | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    if (payload === null || typeof payload !== "object") return null;
    const { sub, role } = payload as Record<string, unknown>;
    if (typeof sub !== "string" || sub === "") return null;
    return { username: sub, role: role === "USER" || role === "ADMIN" ? role : null };
  } catch {
    return null;
  }
}
