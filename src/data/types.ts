import type { BillsData } from '../lib/demo';
import type { Mailbox, SyncResult } from '../lib/emailSync';
import type { RecurringCandidate } from '@huishouden/pwa-kit/recurring';
import type { ContactInput } from '@huishouden/pwa-kit/contact-core';
import type { Bill, BillSettings, BillSource, ManualBillInput, SourceInput } from '../lib/model';

export type { BillsData };

/** Writes return at once (Firestore queues them offline); failures arrive through the store's onError. */
export interface BillsActions {
  /** Marks a bill paid; a repeating manual bill gets its next one. Returns the undo. */
  markPaid(bill: Bill): () => void;
  markUnpaid(bill: Bill): void;
  /** Skips an unpaid bill (kept in history as skipped); a repeating manual bill gets its next one. Returns the undo. */
  skipBill(bill: Bill): () => void;
  /** A skipped bill back on the list. */
  unskipBill(bill: Bill): void;
  saveManualBill(id: string | null, input: ManualBillInput): void;
  /** Deletes a manual bill; hides an email bill (so the next check doesn't bring it back). */
  removeBill(bill: Bill): void;
  /** Puts a bill back exactly as it was (Undo). */
  restoreBill(bill: Bill): void;
  saveSource(id: string | null, input: SourceInput): void;
  /** Deletes a source and its unpaid bills. Returns the undo. */
  deleteSource(source: BillSource): () => void;
  applySync(result: SyncResult): Promise<void>;
  /** A regular charge from card spending becomes a repeating bill, and is never suggested again. Returns the undo. */
  addSuggestion(candidate: RecurringCandidate, input: ManualBillInput): () => void;
  /** "Not a bill": never suggested again. Returns the undo. */
  dismissSuggestion(candidate: RecurringCandidate, name: string): () => void;
  /** Adds or changes a household contact (who a bill is paid to); returns its id. */
  saveContact(id: string | null, input: ContactInput): string;
  /** The household's bill reminders; the time zone defaults to this device's. */
  saveSettings(input: Pick<BillSettings, 'remindDefault' | 'remindDays' | 'remindOverdue'> & { timeZone?: string }): void;
}

/** Where email comes from: the member's Gmail, or the sample mailbox. */
export interface MailAccess {
  /** A mailbox usable without asking anyone (a token from the last hour), or null. */
  stored(): Mailbox | null;
  /** Asks for access; only call from a tap. */
  request(): Promise<Mailbox>;
  /** One line shown next to "Check email" before the first connection. */
  note: string;
}

export interface BillsStore {
  data: BillsData;
  ready: boolean;
  actions: BillsActions;
  mail: MailAccess;
  /** The signed-in member's email (or the sample's). */
  me: string;
  members: string[];
  /** Members who may pay bills (admins and members): the "Who pays" choices. */
  payers: string[];
  /** Signed in: the household and member, for this device's notifications. */
  live?: { householdId: string; email: string };
  /** Time for writes: the sample runs on its own 2031 clock. */
  clock: () => number;
  /** Signed out: invented data, nothing saved. */
  sample: boolean;
}
