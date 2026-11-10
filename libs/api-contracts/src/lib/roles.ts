/**
 * Roles defined by the LilTech API specification.
 * Every authenticated endpoint declares exactly one required role.
 */
export const Role = {
  Team: 'team',
  Jury: 'jury',
  Admin: 'admin',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** All valid roles, e.g. for validation schemas and dropdowns. */
export const ROLES: readonly Role[] = [Role.Team, Role.Jury, Role.Admin];
