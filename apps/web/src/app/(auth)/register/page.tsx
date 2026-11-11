import type { Metadata } from 'next';
import Link from 'next/link';
import { TeamRegistrationForm } from '@/features/registration/team-registration-form';
import styles from '../auth.module.css';

export const metadata: Metadata = {
  title: 'Team Registration',
};

export default function RegisterPage() {
  return (
    <>
      <TeamRegistrationForm />
      <p className={styles.footerPrompt}>
        Already registered your team?{' '}
        <Link href="/login" className={styles.inlineLink}>
          Sign in to your workspace
        </Link>
        .
      </p>
    </>
  );
}
