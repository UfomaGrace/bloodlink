// Toast
// Owner: Victor
//
// Built on Radix Toast. Put <ToastProvider> once at the app root, then call
// useToast() anywhere below it.
//
// Needs from teammates:
// - ../../lib/cn.ts  -> cn(...classes)   (Muizz)
// - tokens.css variables used: --color-surface, --color-text, --color-text-muted, --color-border,
//                               --color-primary, --color-success, --color-danger, --color-focus, --radius
//
// Behaviour:
// - success and info dismiss on their own after 5 seconds (change with `duration`, in ms)
// - errors and toasts with an action (for example "Retry") do not auto-dismiss
// - at most four toasts are visible; adding another removes the oldest,
//   including errors and toasts with an action
// - errors are announced assertively, success and info politely
// - each toast has an icon plus a visually hidden variant word, never colour alone
//
// Usage:
//   // main.tsx
//   <ToastProvider><App /></ToastProvider>
//
//   // anywhere inside
//   const { toast } = useToast();
//   toast({ variant: "success", title: "Request approved" });
//   toast({
//     variant: "error",
//     title: "Could not save your change",
//     description: "Your edit was undone. Check your connection and try again.",
//     action: { label: "Retry", onClick: () => save() },
//   });

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "../cn";

export type ToastVariant = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  /** Defaults to "info". */
  variant?: ToastVariant;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Ignored for errors and toasts with an action. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Shows a toast and returns its id. Removes the oldest when four are already visible. */
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 4;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

const variantStyles: Record<ToastVariant, { accent: string; icon: string; word: string }> = {
  success: { accent: "border-l-[var(--color-success)]", icon: "text-[var(--color-success)]", word: "Success" },
  error: { accent: "border-l-[var(--color-danger)]", icon: "text-[var(--color-danger)]", word: "Error" },
  info: { accent: "border-l-[var(--color-primary)]", icon: "text-[var(--color-primary)]", word: "Information" },
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const common = {
    "aria-hidden": true,
    width: 20,
    height: 20,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "mt-0.5 shrink-0",
  };
  if (variant === "success") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.5l2.5 2.5 4.5-5" />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="8" />
        <path d="M10 6v5M10 14h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5M10 6h.01" />
    </svg>
  );
}

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Classes for the viewport that holds the toasts, to reposition it. */
  viewportClassName?: string;
}

export function ToastProvider({ children, viewportClassName }: ToastProviderProps) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    const item: ToastItem = { ...options, id, variant: options.variant ?? "info" };
    setItems((current) => [...current, item].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider label="Notifications" swipeDirection="right">
        {children}
        {items.map((item) => {
          const styles = variantStyles[item.variant];
          const sticky = item.variant === "error" || item.action !== undefined;
          return (
            <ToastPrimitive.Root
              key={item.id}
              // Errors interrupt the screen reader; success and info wait their turn.
              type={item.variant === "error" ? "foreground" : "background"}
              duration={sticky ? Infinity : (item.duration ?? DEFAULT_DURATION)}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id);
              }}
              className={cn(
                "flex items-start gap-3 rounded-[var(--radius)] border border-l-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-text)] shadow-lg",
                styles.accent,
              )}
            >
              <span className={styles.icon}>
                <VariantIcon variant={item.variant} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <ToastPrimitive.Title className="text-sm font-semibold">
                  <span className="sr-only">{styles.word}: </span>
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-sm text-[var(--color-text-muted)]">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
                {item.action ? (
                  <ToastPrimitive.Action altText={item.action.label} asChild>
                    <button
                      type="button"
                      onClick={item.action.onClick}
                      className={cn(
                        "mt-1 inline-flex min-h-8 w-fit items-center rounded-[var(--radius)] border border-[var(--color-border)] px-3 text-sm font-medium",
                        focusRing,
                      )}
                    >
                      {item.action.label}
                    </button>
                  </ToastPrimitive.Action>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Dismiss notification"
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] hover:bg-[var(--color-border)]",
                  focusRing,
                )}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          className={cn(
            "fixed bottom-0 right-0 z-[100] m-0 flex w-full max-w-[420px] list-none flex-col gap-2 p-4 outline-none",
            viewportClassName,
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>. Add it once at the app root.");
  }
  return context;
}
