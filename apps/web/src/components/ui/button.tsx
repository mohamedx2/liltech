import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  return [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...rest}
    >
      <span
        className={loading ? styles.spinner : `${styles.spinner} ${styles.spinnerIdle}`}
        aria-hidden="true"
      />
      {loading ? <span>{loadingLabel ?? children}</span> : children}
    </button>
  );
}
