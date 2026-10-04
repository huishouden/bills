import { t } from '../i18n';

/** Who bills are paid to, offered as one-tap roles. Stored in English (as Home stores "Landlord"), shown with `contactRoleLabel`. */
export const CONTACT_ROLES = ['Landlord', 'Property manager', 'Lender', 'Insurance', 'HOA', 'Utility'] as const;

const ROLE_KEYS = {
  Landlord: 'contactRole.landlord',
  'Property manager': 'contactRole.propertyManager',
  Lender: 'contactRole.lender',
  Insurance: 'contactRole.insurance',
  HOA: 'contactRole.hoa',
  Utility: 'contactRole.utility',
} as const satisfies Record<(typeof CONTACT_ROLES)[number], string>;

/** A role in the active language: one of `CONTACT_ROLES` (ignoring case) translated, any other as typed. */
export function contactRoleLabel(role: string): string {
  const known = CONTACT_ROLES.find((r) => r.toLowerCase() === role.trim().toLowerCase());
  return known ? t(ROLE_KEYS[known]) : role;
}
