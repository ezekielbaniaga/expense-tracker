import { fakeJwt } from "../test/fakeJwt";
import { decodeIdentity } from "./jwt";

describe("decodeIdentity", () => {
  it("reads sub as the username and role", () => {
    expect(decodeIdentity(fakeJwt({ sub: "alice", role: "ADMIN" }))).toEqual({
      username: "alice",
      role: "ADMIN",
    });
    expect(decodeIdentity(fakeJwt({ sub: "bob", role: "USER" }))).toEqual({
      username: "bob",
      role: "USER",
    });
  });

  it("decodes base64url and UTF-8", () => {
    // "José?>" makes base64 use the url-safe characters and needs UTF-8
    expect(decodeIdentity(fakeJwt({ sub: "José?>~~", role: "USER" }))?.username).toBe("José?>~~");
  });

  it("maps an unknown role to null", () => {
    expect(decodeIdentity(fakeJwt({ sub: "alice", role: "ROOT" }))).toEqual({
      username: "alice",
      role: null,
    });
  });

  it("returns null for a malformed token", () => {
    expect(decodeIdentity("not-a-jwt")).toBeNull();
    expect(decodeIdentity("a.%%%.c")).toBeNull();
    expect(decodeIdentity(fakeJwt({ role: "USER" }))).toBeNull();
  });
});
