"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { TRANSITION_LAYOUT } from "@/lib/motion";
import { IconAlert, IconCheck, IconClose, IconSync } from "@/components/ui/Icons";

/**
 * Transient confirmations.
 *
 * Before this, every action reported itself inline — a sync result printed
 * beside its own button, an access toggle said nothing at all — which meant the
 * outcome appeared wherever the trigger happened to be, and sometimes nowhere.
 * One channel in one place is easier to trust: if something happened, it says so
 * here, and it says so in the same shape every time.
 *
 * Errors are never auto-dismissed. Something the user has to act on must not
 * disappear while they are reading it.
 */

type Tone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Falls back to a no-op outside a provider so a component can be dropped into
 * the static demo, or a test, without dragging the whole chrome along.
 */
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? { toast: () => undefined };
}

const AUTO_DISMISS_MS = 5000;

const TONE: Record<Tone, { className: string; icon: typeof IconCheck }> = {
  success: { className: "border-ok/40 bg-ok/10 text-ok", icon: IconCheck },
  error: { className: "border-danger/40 bg-danger/10 text-danger", icon: IconAlert },
  info: { className: "border-info/40 bg-info/10 text-info", icon: IconSync },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = nextId.current++;
      // Three at a time. Past that the stack becomes a log nobody reads, and it
      // starts covering the content it is reporting on.
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      if (tone !== "error") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
        );
      }
    },
    [dismiss],
  );

  // Unmounting with timers still pending would fire `dismiss` into a dead tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        // `polite` rather than `assertive`: a confirmation should be read after
        // whatever the user is doing, not cut across it.
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const { className, icon: ToneIcon } = TONE[item.tone];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={TRANSITION_LAYOUT}
                className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-black/30 backdrop-blur-md ${className}`}
              >
                <ToneIcon className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0 flex-1 text-ink">{item.message}</p>
                <button
                  onClick={() => dismiss(item.id)}
                  aria-label="Tutup notifikasi"
                  className="-m-1 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                >
                  <IconClose className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
