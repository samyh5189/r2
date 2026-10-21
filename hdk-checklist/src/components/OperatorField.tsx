import type { Operator } from "../types";

interface Props {
  label: string;
  operators: Operator[];
  name: string;
  pin: string;
  onName: (name: string) => void;
  onPin: (pin: string) => void;
  /** Only shift in-charge operators */
  inChargeOnly?: boolean;
}

/** Pick your name from the list (or type it when no list is set up) and enter your PIN if you have one */
export default function OperatorField({ label, operators, name, pin, onName, onPin, inChargeOnly }: Props) {
  const choices = inChargeOnly ? operators.filter((o) => o.inCharge) : operators;
  const selected = operators.find((o) => o.name === name);
  return (
    <div className="operator-field">
      <label>{label}
        {operators.length > 0 ? (
          <select value={name} onChange={(e) => { onName(e.target.value); onPin(""); }}>
            <option value="">Select your name…</option>
            {choices.map((o) => <option key={o.id} value={o.name}>{o.name}{o.rank ? ` (${o.rank})` : ""}</option>)}
          </select>
        ) : (
          <input value={name} placeholder="Full name" onChange={(e) => onName(e.target.value)} />
        )}
      </label>
      {selected?.hasPin && (
        <label>PIN
          <input className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength={8} placeholder="••••"
            value={pin} onChange={(e) => onPin(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
    </div>
  );
}
