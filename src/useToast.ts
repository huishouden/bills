import { useCallback, useState } from 'react';
import type { ToastState } from './components/ui';

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback((message: string, undo?: () => void) => setToast({ id: Date.now(), message, tone: 'info', undo }), []);
  const fail = useCallback((message: string) => setToast({ id: Date.now(), message, tone: 'error' }), []);
  const clear = useCallback(() => setToast(null), []);
  return { toast, notify, fail, clear };
}
