import { useState, type ComponentProps, type ReactNode } from "react";
import { FieldError, errorProps } from "./forms";

/*
 * Labelled form fields. Each keeps a native control underneath, with the label
 * above it and the error below, wired through errorProps/FieldError. The ref
 * and the rest of the props (react-hook-form's register) go to the control.
 */

interface FieldShellProps {
  id: string;
  label: string;
  error: string | undefined;
  className?: string;
  children: ReactNode;
}

function FieldShell({ id, label, error, className, children }: FieldShellProps) {
  const classes = ["field", error ? "field--invalid" : undefined, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      <FieldError id={id} message={error} />
    </div>
  );
}

type FieldProps<T extends "input" | "select"> = Omit<ComponentProps<T>, "id"> & {
  id: string;
  label: string;
  error?: string;
};

export function TextField({ id, label, error, className, ...rest }: FieldProps<"input">) {
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <input id={id} {...errorProps(id, error)} {...rest} />
    </FieldShell>
  );
}

export function SelectField({ id, label, error, className, children, ...rest }: FieldProps<"select">) {
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <select id={id} {...errorProps(id, error)} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function DateField(props: Omit<FieldProps<"input">, "type">) {
  return <TextField {...props} type="date" />;
}

/** A large, centered amount input; the decimal keypad on touch screens. */
export function AmountField({ className, ...props }: Omit<FieldProps<"input">, "type" | "inputMode">) {
  return (
    <TextField
      {...props}
      className={["field--amount", className].filter(Boolean).join(" ")}
      inputMode="decimal"
    />
  );
}

/** A password input with an in-field eye icon toggle; the button keeps one name and says its state with aria-pressed. */
export function PasswordField({ id, label, error, className, ...rest }: Omit<FieldProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <div className="password-input">
        <input id={id} {...errorProps(id, error)} {...rest} type={shown ? "text" : "password"} />
        <button
          type="button"
          className="password-input__toggle"
          aria-label="Show password"
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {shown ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <path d="M1 1l22 22" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
    </FieldShell>
  );
}
