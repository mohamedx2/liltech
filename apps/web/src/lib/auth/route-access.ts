import { Role } from 'api-contracts';
import { assertNever } from 'shared';

export interface NavItem {
  readonly label: string;
  readonly href: string;
}

export const PUBLIC_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', href: '/' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Tracks', href: '/challenges' },
  { label: 'Register Team', href: '/register' },
];

/**
 * Canonical home route per server-verified role.
 * Mirrors the planned role portals in `docs/frontend/FRONTEND_IMPLEMENTATION_PLAN.md`.
 */
export function getRoleHomePath(role: Role): string {
  switch (role) {
    case Role.Team:
      return '/team';
    case Role.Jury:
      return '/jury';
    case Role.Admin:
      return '/admin';
    default:
      return assertNever(role, 'role');
  }
}

export function getRoleLabel(role: Role): string {
  switch (role) {
    case Role.Team:
      return 'Team';
    case Role.Jury:
      return 'Jury';
    case Role.Admin:
      return 'Admin';
    default:
      return assertNever(role, 'role');
  }
}

export function getRoleNavItems(role: Role): readonly NavItem[] {
  switch (role) {
    case Role.Team:
      return [
        { label: 'Dashboard & QR Pass', href: '/team' },
        { label: 'Mini-CTF', href: '/team/ctf' },
        { label: 'Challenge', href: '/team/challenge' },
        { label: 'Submissions', href: '/team/submissions' },
        { label: 'Announcements', href: '/team/announcements' },
      ];
    case Role.Jury:
      return [
        { label: 'Assigned Teams', href: '/jury' },
        { label: 'Scoring Guide', href: '/schedule' },
      ];
    case Role.Admin:
      return [
        { label: 'Control Panel', href: '/admin' },
        { label: 'QR Check-In', href: '/checkin' },
        { label: 'Teams', href: '/admin/teams' },
        { label: 'Mini-CTF', href: '/admin/ctf' },
        { label: 'Challenges', href: '/admin/challenges' },
        { label: 'Jury', href: '/admin/jury' },
        { label: 'Results', href: '/admin/results' },
      ];
    default:
      return assertNever(role, 'role');
  }
}
