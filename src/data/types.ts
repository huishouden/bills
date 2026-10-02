import type { BillsData } from '../lib/demo';
import type { Mailbox, SyncResult } from '../lib/emailSync';
import type { Bill, BillSource, ManualBillInput, SourceInput } from '../lib/model';

export type { BillsData };

/** Writes return at once (Firestore queues them offline); failures arrive through the store's onError. */
export interface BillsActions {
  /** Marks a bill paid; a repeating manual bill gets its next one. Returns the undo. */
  markPaid(bill: Bill): () => void;
  markUnpaid(bill: Bill): void;
  saveManualBill(id: string | null, input: ManualBillInput): void;
  /** Deletes a manual bill; hides an email bill (so the next check doesn't bring it back). */
  removeBill(bill: Bill): void;
  /** Puts a bill back exactly as it was (Undo). */
  restoreBill(bill: Bill): void;
  saveSource(id: string | null, input: SourceInput): void;
  /** Deletes a source and its unpaid bills. Returns the undo. */
  deleteSource(source: BillSource): () => void;
  applySync(result: SyncResult): Promise<void>;
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
  /** Time for writes: the sample runs on its own 2031 clock. */
  clock: () => number;
  /** Signed out: invented data, nothing saved. */
  sample: boolean;
}
