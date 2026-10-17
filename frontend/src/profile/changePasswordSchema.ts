import { z } from "zod";
import { hasContent, PASSWORD_MAX_BYTES, PASSWORD_MIN } from "../auth/registerSchema";

export interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
}

/** ChangePasswordRequest caps the current password against huge bodies; not a password rule. */
const CURRENT_PASSWORD_MAX = 1000;

/**
 * Mirrors ChangePasswordRequest and PasswordValidator, no stricter: the
 * server has no rule against reusing the current password, so neither does
 * this. `username` is the signed-in name, for the same-as-username rule.
 */
export function changePasswordSchema(username: string) {
  return z.object({
    currentPassword: z
      .string()
      .refine(hasContent, "Current password is required")
      .refine((v) => v.length <= CURRENT_PASSWORD_MAX, `Current password must be at most ${CURRENT_PASSWORD_MAX} characters`),
    newPassword: z
      .string()
      .refine(hasContent, "Password is required")
      .refine((v) => !hasContent(v) || v.length >= PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
      .refine(
        (v) => new TextEncoder().encode(v).length <= PASSWORD_MAX_BYTES,
        `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
      )
      // Usernames are case-insensitive, so the server compares ignoring case
      .refine((v) => username === "" || v.toLowerCase() !== username.toLowerCase(), "Password must not be the username"),
  });
}

/** First message per field, in the shape react-hook-form's resolver expects. */
export function validateChangePassword(
  values: ChangePasswordFormValues,
  username: string,
): Partial<Record<keyof ChangePasswordFormValues, string>> {
  const result = changePasswordSchema(username).safeParse(values);
  const errors: Partial<Record<keyof ChangePasswordFormValues, string>> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof ChangePasswordFormValues;
      if (!(field in errors)) errors[field] = issue.message;
    }
  }
  return errors;
}
