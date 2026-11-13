import type { HTMLAttributes, ReactNode } from 'react';
import styles from './card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: 'default' | 'raised';
  /** `panel` for page containers, `row` for hairline-divided list items. */
  variant?: 'panel' | 'row';
  children: ReactNode;
}

export function Card({
  surface = 'default',
  variant = 'panel',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        styles.card,
        styles[variant],
        surface === 'raised' ? styles.raised : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({
  as: Tag = 'h2',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h1' | 'h2' | 'h3' | 'h4' }) {
  return (
    <Tag className={[styles.title, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

export function CardDescription({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={[styles.description, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.content, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.footer, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
