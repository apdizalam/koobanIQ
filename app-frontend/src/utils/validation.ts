import { z } from 'zod';

/** Same limits as the backend (backend/src/lib/validate.ts). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Field error keys under mobile.auth.errors in the shared translation files. */
export type FieldErrorKey =
  'emailTaken' | 'emailInvalid' | 'passwordRequired' | 'passwordTooShort' | 'passwordTooLong';

const email = z
  .string()
  .trim()
  .pipe(z.email({ error: 'emailInvalid' }));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'passwordRequired' }),
});

export const signUpSchema = z.object({
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, { error: 'passwordTooShort' })
    .max(PASSWORD_MAX, { error: 'passwordTooLong' }),
});

export type FieldErrors<T> = Partial<Record<keyof T, FieldErrorKey>>;

/** Checks a form; returns the cleaned values or one error key per bad field. */
export function check<S extends z.ZodType<Record<string, unknown>>>(
  schema: S,
  values: z.input<S>,
): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors<z.input<S>> } {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors<z.input<S>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof z.input<S>;
    errors[field] ??= issue.message as FieldErrorKey;
  }
  return { ok: false, errors };
}
