import { useEffect, useMemo, useRef } from "react";
import type { Operator } from "../types";
import { isMaintenance, rememberName, rememberedName } from "../operators";

interface Props {
  label: string;
  operators: Operator[];
  name: string;
  pin: string;
  onName: (name: string) => void;
  onPin: (pin: string) => void;
  /** Only shift in-charge operators */
  inChargeOnly?: boolean;
  /** Who may be picked: ARFF operators (default), or maintenance officers as well */
  withMaintenance?: boolean;
  /** Remember the name picked on this device for this purpose and pick it again next time */
  rememberAs?: string;
}

/** Pick your name from the list (or type it when no list is set up) and enter your PIN if you have one */
export default function OperatorField({ label, operators, name, pin, onName, onPin, inChargeOnly, withMaintenance, rememberAs }: Props) {
  const { arff, maintenance, choices } = useMemo(() => {
    const arff = operators.filter((o) => !isMaintenance(o) && (!inChargeOnly || o.inCharge));
    const maintenance = withMaintenance ? operators.filter(isMaintenance) : [];
    return { arff, maintenance, choices: [...arff, ...maintenance] };
  }, [operators, inChargeOnly, withMaintenance]);
  const selected = choices.find((o) => o.name === name);

  // Pick the name last used on this device, once, as soon as the list has loaded
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !rememberAs || choices.length === 0) return;
    applied.current = true;
    const last = rememberedName(rememberAs);
    if (!name && choices.some((o) => o.name === last)) onName(last);
  }, [rememberAs, choices, name, onName]);

  function pick(n: string) {
    onName(n);
    onPin("");
    if (rememberAs && n) rememberName(rememberAs, n);
  }

  const option = (o: Operator) => <option key={o.id} value={o.name}>{o.name}{o.rank ? ` (${o.rank})` : ""}</option>;
  return (
    <div className="operator-field">
      <label>{label}
        {operators.length > 0 ? (
          <select value={selected ? name : ""} onChange={(e) => pick(e.target.value)}>
            <option value="">Select your name…</option>
            {maintenance.length > 0 ? (
              <>
                <optgroup label="ARFF">{arff.map(option)}</optgroup>
                <optgroup label="Maintenance">{maintenance.map(option)}</optgroup>
              </>
            ) : arff.map(option)}
          </select>
        ) : (
          <input value={name} placeholder="Full name" autoComplete="name" onChange={(e) => onName(e.target.value)} />
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
