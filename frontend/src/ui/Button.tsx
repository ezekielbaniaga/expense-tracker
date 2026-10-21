import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Shows a spinner, sets aria-busy and blocks clicks; the label stays for screen readers. */
  pending?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  /** The accessible name; an icon alone says nothing to a screen reader. */
  label: string;
  variant?: ButtonVariant;
};

export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = ["btn", "btn--icon", `btn--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}
