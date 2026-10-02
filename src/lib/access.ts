import { can, householdRole } from '@huishouden/pwa-kit/roles';
import type { Household } from '@huishouden/pwa-kit/household';

/** Whether this person may open the household's bills: admins and members, never helpers or kids. */
export const seesMoney = (household: Pick<Household, 'members' | 'roles'>, email: string) => can(householdRole(household, email), 'see-money');
