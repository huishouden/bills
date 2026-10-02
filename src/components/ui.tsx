import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Shapes mirror the Huishouden tasks app's ui.tsx (DESIGN.md "Components").

export const inputClass =
  'w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200';

export const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-forest-600 disabled:opacity-50';

export const ghostButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 font-medium text-stone-600 transition-colors duration-150 hover:bg-stone-100';

export const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-600 transition-colors duration-150 hover:bg-stone-100 disabled:opacity-30';

export const cardClass = 'rounded-2xl border border-stone-200 bg-white shadow-sm';

export const overline = 'text-xs font-semibold uppercase tracking-wide text-stone-600';

export function Chip({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
        active ? 'border-forest-700 bg-forest-700 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-forest-400'
      }`}
    >
      {children}
    </button>
  );
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label="Close"])')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-stone-800">{title}</h2>
          <button type="button" onClick={onClose} className={iconButton} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-stone-600">{hint}</span>}
    </label>
  );
}

export interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'error';
  undo?: () => void;
}

export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDone, toast.tone === 'error' ? 9000 : 6000);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {toast && (
        <div
          className={`pointer-events-auto flex min-h-14 max-w-xl items-center gap-4 rounded-2xl px-5 py-2 text-base font-medium text-white shadow-lg ${
            toast.tone === 'error' ? 'bg-red-700' : 'bg-stone-800'
          }`}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                onDone();
              }}
              className="min-h-11 rounded-xl px-3 font-semibold text-forest-200 underline-offset-4 hover:underline"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A text link with a 44px target: phone numbers, Open in Google Maps, Open in Calendar. */
export const linkClass =
  '-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium text-forest-700 underline-offset-4 transition-colors duration-150 hover:bg-forest-50 hover:underline';

/** The second action next to a primary button. */
export const secondaryButton = `${ghostButton} border border-stone-200 bg-white disabled:opacity-50`;

export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-red-50 px-3 py-2 text-base text-red-700">
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" className="min-h-11 rounded-xl px-3 font-semibold underline-offset-4 hover:underline" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
