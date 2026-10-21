import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { setDialogHost, type ConfirmOptions, type ToastKind } from "../dialogs";

interface Toast { id: number; message: string; kind: ToastKind }
const ICON = { success: CircleCheck, error: CircleAlert, info: Info };

/** Renders confirmation dialogs and toasts requested through dialogs.ts */
export default function DialogHost() {
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDialogHost({
      confirm: (opts) => new Promise((resolve) => setAsk({ ...opts, resolve })),
      toast: (message, kind) => {
        const id = ++nextId.current;
        setToasts((t) => [...t.slice(-2), { id, message, kind }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
      },
    });
    return () => setDialogHost(null);
  }, []);

  useEffect(() => {
    if (!ask) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close(ok: boolean) {
    ask?.resolve(ok);
    setAsk(null);
  }

  return (
    <>
      {ask && (
        <div className="dlg-overlay" onClick={() => close(false)}>
          <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="dlg-title" className="dlg-title">{ask.title}</h3>
            {ask.message && <p className="dlg-msg">{ask.message}</p>}
            <div className="dlg-btns">
              <button className="dlg-cancel" onClick={() => close(false)}>{ask.cancelLabel ?? "Cancel"}</button>
              <button ref={confirmBtn} className={`dlg-ok${ask.danger ? " danger" : ""}`} onClick={() => close(true)}>{ask.confirmLabel ?? "OK"}</button>
            </div>
          </div>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
              <Icon size={18} className="toast-icon" />
              <span>{t.message}</span>
              <button className="toast-x" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}
