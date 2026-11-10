import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/features/auth/login-form';
import styles from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Sign In',
};

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <p className={styles.footerPrompt}>
        New team for LilTech 2026?{' '}
        <Link href="/register" className={styles.inlineLink}>
          Register a 3–5 member team
        </Link>
        .
      </p>
    </>
  );
}
