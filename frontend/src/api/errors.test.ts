import { ApiError, fieldErrors, parseApiError } from "./errors";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("parseApiError", () => {
  it("parses VALIDATION_ERROR", async () => {
    const err = await parseApiError(
      json(400, {
        code: "VALIDATION_ERROR",
        messages: ["amount: must be greater than 0", "category must not be blank"],
        timestamp: "2026-10-18T01:02:03",
      }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.messages).toHaveLength(2);
    expect(err.retryAfter).toBeUndefined();
  });

  it("parses INVALID_CATEGORY", async () => {
    const err = await parseApiError(
      json(400, { code: "INVALID_CATEGORY", messages: ["Invalid category: FOO"], timestamp: "x" }),
    );
    expect(err.code).toBe("INVALID_CATEGORY");
    expect(err.messages).toEqual(["Invalid category: FOO"]);
  });

  it("parses MALFORMED_REQUEST", async () => {
    const err = await parseApiError(
      json(400, {
        code: "MALFORMED_REQUEST",
        messages: ["Request body is missing or malformed"],
        timestamp: "x",
      }),
    );
    expect(err.code).toBe("MALFORMED_REQUEST");
    expect(fieldErrors(err)).toEqual({
      fields: {},
      form: ["Request body is missing or malformed"],
    });
  });

  it("reads Retry-After on a 429", async () => {
    const err = await parseApiError(
      json(
        429,
        { code: "TOO_MANY_REQUESTS", messages: ["slow down"], timestamp: "x" },
        { "Retry-After": "42" },
      ),
    );
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(42);
  });

  it("ignores a Retry-After that is not a whole number of seconds", async () => {
    const err = await parseApiError(
      json(429, { code: "TOO_MANY_REQUESTS", messages: [] }, { "Retry-After": "soon" }),
    );
    expect(err.retryAfter).toBeUndefined();
  });

  it("still yields an ApiError for a non-JSON body", async () => {
    const err = await parseApiError(
      new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.messages).toEqual([]);
  });

  it("tolerates JSON of the wrong shape", async () => {
    const err = await parseApiError(json(500, { messages: "oops", code: 7 }));
    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.messages).toEqual([]);
  });
});

describe("fieldErrors", () => {
  it("splits on the first colon and keeps the rest of the message", () => {
    const err = new ApiError(400, "VALIDATION_ERROR", [
      "description: size must be between 0 and 250",
      "date: must be a date in the past or in the present: today",
      "something went wrong overall",
    ]);
    expect(fieldErrors(err)).toEqual({
      fields: {
        description: "size must be between 0 and 250",
        date: "must be a date in the past or in the present: today",
      },
      form: ["something went wrong overall"],
    });
  });

  it("keeps the first message per field", () => {
    const err = new ApiError(400, "VALIDATION_ERROR", ["amount: first", "amount: second"]);
    expect(fieldErrors(err).fields).toEqual({ amount: "first" });
  });

  it("treats other codes as form-level only", () => {
    const err = new ApiError(400, "INVALID_CATEGORY", ["Invalid category: FOO"]);
    expect(fieldErrors(err)).toEqual({ fields: {}, form: ["Invalid category: FOO"] });
  });
});
