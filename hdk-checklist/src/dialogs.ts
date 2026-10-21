// Tiny bridge so any component can ask for a confirmation or show a toast through the app-wide host

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deleting or discarding */
  danger?: boolean;
}
export type ToastKind = "success" | "error" | "info";

interface Host {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, kind: ToastKind) => void;
}
let host: Host | null = null;

export function setDialogHost(h: Host | null) { host = h; }

/** Resolves true when the user confirms, false when they cancel */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return host ? host.confirm(opts) : Promise.resolve(window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title));
}

export function toast(message: string, kind: ToastKind = "success") {
  host?.toast(message, kind);
}
