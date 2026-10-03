import { Building2, Droplet, Flame, House, Receipt, ShieldCheck, Smartphone, Wifi, Zap, type LucideIcon } from 'lucide-react';
import type { Autopay, BillKind } from '../lib/model';

const ICONS: Record<BillKind, LucideIcon> = {
  electric: Zap,
  gas: Flame,
  water: Droplet,
  internet: Wifi,
  phone: Smartphone,
  mortgage: House,
  hoa: Building2,
  insurance: ShieldCheck,
  other: Receipt,
};

export function KindIcon({ kind, attention, size = 22 }: { kind: BillKind; attention?: boolean; size?: number }) {
  const Icon = ICONS[kind] ?? Receipt;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${attention ? 'bg-attention-tint text-attention' : 'bg-tint text-link'}`}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

/** "Autopay on" (or "by card"), "Autopay off", "Autopay unknown": off and unknown take the attention colour when it matters. */
export function AutopayChip({ autopay, attention }: { autopay: Autopay | null; attention?: boolean }) {
  const text = autopay === null ? 'Autopay unknown' : autopay.enrolled ? (autopay.via === 'card' ? 'Autopay by card' : 'Autopay on') : 'Autopay off';
  const tone = autopay?.enrolled
    ? 'border-forest-200 bg-tint text-link dark:border-forest-500'
    : attention
      ? 'border-terracotta bg-attention-tint text-attention'
      : 'border-line bg-surface text-muted';
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-sm font-medium whitespace-nowrap ${tone}`}>{text}</span>;
}

/** "Sam" from sam@example.com; "you" for the signed-in member. */
export function personName(email: string, me: string): string {
  if (email.toLowerCase() === me.toLowerCase()) return 'you';
  const local = email.split('@')[0].split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : email;
}
