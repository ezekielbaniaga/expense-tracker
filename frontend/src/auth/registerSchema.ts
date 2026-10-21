import { z } from "zod";

export interface RegisterFormValues {
  username: string;
  password: string;
}

/** The backend's UsernameValidator: ASCII only, after stripping surrounding whitespace. */
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
/** users.username is VARCHAR(100); the DTO checks the length before stripping. */
const USERNAME_MAX = 100;
/** PasswordValidator.MIN_LENGTH, in UTF-16 units like Java's String.length(). */
export const PASSWORD_MIN = 12;
/** BCrypt only hashes the first 72 bytes, so the server rejects longer passwords. */
export const PASSWORD_MAX_BYTES = 72;

/** Java's trim(), which @NotBlank uses: anything above U+0020 counts as content. */
export function hasContent(value: string): boolean {
  return [...value].some((c) => c > " ");
}

/**
 * Mirrors the backend's RegisterRequest, UsernameValidator and PasswordValidator,
 * no stricter, so the server's 400s are only a backstop.
 */
export const registerSchema = z
  .object({
    username: z
      .string()
      .refine((v) => v.trim() !== "", "Username is required")
      .refine((v) => v.length <= USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
      .refine(
        (v) => v.trim() === "" || USERNAME_PATTERN.test(v.trim()),
        "Username may only contain letters A-Z, digits, '.', '_' and '-'",
      ),
    password: z
      .string()
      .refine(hasContent, "Password is required")
      .refine((v) => !hasContent(v) || v.length >= PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
      .refine(
        (v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_BYTES,
        `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
      ),
  })
  // Usernames are case-insensitive, so the server compares ignoring case
  .refine((v) => v.password.toLowerCase() !== v.username.trim().toLowerCase(), {
    message: "Password must not be the username",
    path: ["password"],
  });

/** First message per field, in the shape react-hook-form's resolver expects. */
export function validateRegister(values: RegisterFormValues): Partial<Record<keyof RegisterFormValues, string>> {
  const result = registerSchema.safeParse(values);
  const errors: Partial<Record<keyof RegisterFormValues, string>> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof RegisterFormValues;
      if (!(field in errors)) errors[field] = issue.message;
    }
  }
  return errors;
}

/** The request body; the server strips the name too, and login must use the same text. */
export function toRegisterRequest(values: RegisterFormValues): RegisterFormValues {
  return { username: values.username.trim(), password: values.password };
}

/** The password rules as a live checklist; the same checks the schema makes, one flag each. */
export function passwordRules(values: RegisterFormValues): { id: string; label: string; met: boolean }[] {
  const { username, password } = values;
  return [
    { id: "length", label: `${PASSWORD_MIN} or more characters`, met: password.length >= PASSWORD_MIN },
    {
      id: "bytes",
      label: `At most ${PASSWORD_MAX_BYTES} bytes`,
      met: hasContent(password) && new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES,
    },
    {
      id: "username",
      label: "Not the username",
      met: hasContent(password) && password.toLowerCase() !== username.trim().toLowerCase(),
    },
  ];
}
