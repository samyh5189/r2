import { useState } from "react";
import SignatureField from "./SignatureField";

interface Props {
  /** The operator's saved signature (after their PIN), if any */
  saved: string | null;
  onChange: (signature: string) => void;
  /** Offer "save for next time" (operator has a PIN) */
  canSave: boolean;
  onSaveChange: (save: boolean) => void;
  height?: number;
}

/** Use the saved signature, or sign now (optionally saving it for next time) */
export default function SignatureChoice({ saved, onChange, canSave, onSaveChange, height }: Props) {
  const [useSaved, setUseSaved] = useState(!!saved);
  const [save, setSave] = useState(false);

  if (saved && useSaved) {
    return (
      <div className="sig-saved">
        <img src={saved} alt="Your saved signature" className="signed-img" />
        <div className="sig-actions">
          <span className="sig-hint">Your saved signature</span>
          <button type="button" className="btn-clear" onClick={() => { setUseSaved(false); onChange(""); }}>Sign again</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <SignatureField onChange={onChange} height={height} />
      {canSave && (
        <label className="sig-save">
          <input type="checkbox" checked={save} onChange={(e) => { setSave(e.target.checked); onSaveChange(e.target.checked); }} />
          {saved ? "Replace my saved signature with this one" : "Save this signature for next time"}
        </label>
      )}
      {saved && <button type="button" className="btn-new" style={{ fontSize: 12 }} onClick={() => { setUseSaved(true); onChange(saved); }}>Use my saved signature</button>}
    </>
  );
}
