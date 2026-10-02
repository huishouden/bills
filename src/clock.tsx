import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface Clock {
  /** Re-rendered every 15 seconds, so "ago" values move without a reload. */
  now: number;
  /** Current time for writes. The demo runs on its own clock, offset to a fixed day in 2031. */
  read: () => number;
}

const ClockContext = createContext<Clock>({ now: Date.now(), read: () => Date.now() });

export function ClockProvider({ read, children }: { read: () => number; children: ReactNode }) {
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(read());
    tick();
    const id = setInterval(tick, 15_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [read]);
  // Reading the time for a write also moves the shared clock, so a new entry is never "in the future".
  const readAndTick = useCallback(() => {
    const t = read();
    setNow(t);
    return t;
  }, [read]);
  return <ClockContext.Provider value={{ now, read: readAndTick }}>{children}</ClockContext.Provider>;
}

export const useClock = () => useContext(ClockContext);
