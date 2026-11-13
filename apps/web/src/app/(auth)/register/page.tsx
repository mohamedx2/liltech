import type { Metadata } from 'next';
import { RegisterBackdrop } from '@/features/registration/register-backdrop';
import { TeamRegistrationForm } from '@/features/registration/team-registration-form';

export const metadata: Metadata = {
  title: 'Team Registration',
};

export default function RegisterPage() {
  return (
    <>
      <RegisterBackdrop />
      <div data-full-bleed>
        <TeamRegistrationForm />
      </div>
    </>
  );
}
