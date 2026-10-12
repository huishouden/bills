import { collection, or, query, where, type Firestore } from 'firebase/firestore';
import { addDays, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';

/** How far back paid and closed bills are read: History's six months, with room. */
export const BILL_DAYS = 200;

/**
 * The bills the app reads: those due or added in the last `BILL_DAYS` days (a bill with no due date
 * by when it was added). That is what History (six months), Upcoming, the email check (60 days of statements, each
 * added after its email) and the repeating series (whose next bill is always ahead) need. Nothing
 * older is read again, whatever its status: the collection grows by every statement, and bills that
 * are over in the app's terms often keep `status: 'due'` (an autopay bill a rollover followed, a
 * skipped or removed one), so a status can't bound it, nor can a missing due date (statements
 * that carry none keep `due: null` once paid). A bill left unpaid more than `BILL_DAYS` past its
 * due date, or added that long ago without one, leaves the screens. A listener bills each document it returns on every open.
 */
export function billsQuery(db: Firestore, base: string, now: number) {
  const since = addDays(toYmd(now), -BILL_DAYS);
  return query(collection(db, base, 'bills'), or(where('due', '>=', since), where('createdAt', '>=', ymdToTime(since))));
}

