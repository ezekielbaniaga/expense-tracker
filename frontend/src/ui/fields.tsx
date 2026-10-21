import type { ComponentProps, ReactNode } from "react";
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
