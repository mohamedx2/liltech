import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/login-form';
import { RegisterBackdrop } from '@/features/registration/register-backdrop';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Sign In',
};

export default function LoginPage() {
  return (
    <>
      <RegisterBackdrop />
      <div className={styles.stage}>
        <LoginForm />
      </div>
    </>
  );
}
