// Dialog and ConfirmDialog
// Owner: Victor
//
// Built on Radix Dialog: focus moves in on open and is trapped, Escape closes,
// focus returns to the opener. Title and description are required props.
//
// Needs from teammates (same-named exports expected):
// - ../../lib/cn.ts          -> cn(...classes)           (Muizz)
// - ./button.tsx             -> Button with `variant` ("primary" | "secondary" | "danger" | "ghost"),
//                               `size` ("sm" | "md" | "lg"), `loading` (boolean), forwarded ref (Muizz)
// - tokens.css variables used: --color-surface, --color-text, --color-text-muted, --color-border,
//                               --color-focus, --radius, plus --color-text on a dimmed backdrop (see overlay)
//
// Usage (plain dialog with a trigger):
//   <Dialog
//     trigger={<Button>View details</Button>}
//     title="Stock count details"
//     description="Last counted on 22 October."
//   >
//     ...body content...
//   </Dialog>
//
// Usage (confirm, destructive):
//   <ConfirmDialog
//     trigger={<Button variant="danger">Delete item</Button>}
//     title="Delete this item?"
//     description="This removes it from your stock list. You cannot undo this."
//     confirmLabel="Delete item"
//     tone="danger"
//     onConfirm={async () => { await deleteItem(id); }}
//   />

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../cn";
import { Button } from "./button";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

export interface DialogProps {
  /** Short name of the dialog. Required so screen readers always announce it. */
  title: React.ReactNode;
  /** One or two sentences on what the dialog is for. Required for the same reason. */
  description: React.ReactNode;
  /** Element that opens the dialog (usually a Button). Focus returns to it on close. */
  trigger?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons shown at the bottom. */
  footer?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Override where focus lands on open. Call event.preventDefault() then focus your own element. */
  onOpenAutoFocus?: (event: Event) => void;
  className?: string;
}

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    title,
    description,
    trigger,
    children,
    footer,
    open,
    defaultOpen,
    onOpenChange,
    onOpenAutoFocus,
    className,
  },
  ref,
) {
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/50" />
        <DialogPrimitive.Content
          ref={ref}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-text)] shadow-lg",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-[var(--color-text-muted)]">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]",
                focusRing,
              )}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </DialogPrimitive.Close>
          </div>
          {children ? <div className="text-sm">{children}</div> : null}
          {footer ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});

export interface ConfirmDialogProps
  extends Omit<DialogProps, "footer" | "children" | "onOpenAutoFocus"> {
  /** Names the action: "Approve request", not "OK". Required. */
  confirmLabel: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** "danger" for delete, reverse and similar. Focus starts on Cancel in this tone. */
  tone?: "default" | "danger";
  /**
   * Runs when the user confirms. If it returns a promise, the confirm button shows its
   * loading state until it settles. The dialog closes when it resolves and stays open
   * if it throws, so handle the error yourself (for example with an error Toast).
   */
  onConfirm: () => void | Promise<void>;
  /** Force the loading state from outside, for example while a mutation is in flight. */
  loading?: boolean;
  /** Optional extra content between the description and the buttons. */
  children?: React.ReactNode;
}

export const ConfirmDialog = React.forwardRef<HTMLDivElement, ConfirmDialogProps>(function ConfirmDialog(
  {
    confirmLabel,
    cancelLabel = "Cancel",
    tone = "default",
    onConfirm,
    loading = false,
    open,
    defaultOpen,
    onOpenChange,
    children,
    ...rest
  },
  ref,
) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const [pending, setPending] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const busy = pending || loading;

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  // Do not let the dialog close (Escape, overlay click, X) while a confirm is running.
  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    setOpen(next);
  };

  const handleConfirm = async () => {
    if (busy) return;
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // Stay open so the user can retry. The caller reports the error.
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      {...rest}
      ref={ref}
      open={isOpen}
      onOpenChange={handleOpenChange}
      onOpenAutoFocus={(event) => {
        if (tone === "danger") {
          event.preventDefault();
          cancelRef.current?.focus();
        }
      }}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" disabled={busy} onClick={() => handleOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
});
