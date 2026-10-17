function b64url(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** An unsigned token with the given payload; the browser never verifies it. */
export function fakeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;
}
