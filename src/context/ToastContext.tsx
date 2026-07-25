'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { reportError } from '@/src/lib/reportError';
// Re-exported because callers have long imported the unwrapper from here; it
// now lives with the other error helpers so non-React callers can use it too.
export { toUserFacingMessage } from '@/src/lib/errors';
import { toUserFacingMessage } from '@/src/lib/errors';

export type ToastTone = 'error' | 'success' | 'info';

export type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
};

type ToastContextType = {
  toasts: Toast[];
  showToast: (message: string, tone?: ToastTone) => void;
  /**
   * Surface a caught error to the user and route it to the reporting seam in
   * one call. Returns the message shown, for callers that also want it inline.
   */
  showErrorToast: (error: unknown, options?: { scope?: string; fallbackMessage?: string }) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const AUTO_DISMISS_MS = 6000;

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      counterRef.current += 1;
      const id = `toast-${counterRef.current}`;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast],
  );

  const showErrorToast = useCallback<ToastContextType['showErrorToast']>(
    (error, options) => {
      const fallback = options?.fallbackMessage ?? 'Something went wrong. Please try again.';
      const message = toUserFacingMessage(error, fallback);
      reportError(error, { scope: options?.scope ?? 'ui-action' });
      showToast(message, 'error');
      return message;
    },
    [showToast],
  );

  const value = useMemo(
    () => ({ toasts, showToast, showErrorToast, dismissToast }),
    [toasts, showToast, showErrorToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

const TONE_ICONS: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

const TONE_STYLES: Record<ToastTone, string> = {
  error: 'border-destructive/30 text-destructive',
  success: 'border-emerald-500/30 text-emerald-500',
  info: 'border-border-dim text-foreground',
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      // Assertive: these announce a failed action the user just attempted.
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed bottom-6 right-6 z-[999999] flex flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-xl ${TONE_STYLES[toast.tone]}`}
            >
              <Icon className="mt-[2px] h-4 w-4 flex-shrink-0" />
              <p className="flex-1 text-[13px] font-light leading-relaxed text-foreground">
                {toast.message}
              </p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss(toast.id)}
                className="text-muted transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
