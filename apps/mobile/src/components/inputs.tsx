import { useState, type ReactNode } from 'react';

export function Question({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="q">
      <div className="q-label">{label}</div>
      {help && <div className="help">{help}</div>}
      {children}
      {error && <div className="error-text" role="alert">{error}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CheckItem({
  checked,
  onToggle,
  label,
  sublabel,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  sublabel?: string | null;
}) {
  return (
    <button type="button" className="check" aria-pressed={checked} onClick={onToggle}>
      <span className="box" aria-hidden>{checked ? '✓' : ''}</span>
      <span>
        {label}
        {sublabel && <span className="local">{sublabel}</span>}
      </span>
    </button>
  );
}

/**
 * A number field with visible +/- controls.
 *
 * The spec asks for "type or swipe or press the +/-": a stepper is the version
 * of that which works with gloves on and never needs a keyboard to appear.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - 1))} aria-label={`Decrease ${ariaLabel}`}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits === '' ? min : clamp(Number(digits)));
        }}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} aria-label={`Increase ${ariaLabel}`}>
        +
      </button>
    </div>
  );
}

/** Three steppers side by side — the years/months/days control on screens 1 and 3. */
export function TripleNumber({
  value,
  onChange,
  labels = ['Years', 'Months', 'Days'],
  maxima = [150, 11, 30],
}: {
  value: { years: number; months: number; days: number };
  onChange: (value: { years: number; months: number; days: number }) => void;
  labels?: [string, string, string] | string[];
  maxima?: [number, number, number] | number[];
}) {
  const parts: Array<keyof typeof value> = ['years', 'months', 'days'];
  return (
    <div className="triple">
      {parts.map((part, index) => (
        <div className="part" key={part}>
          <label htmlFor={`triple-${part}`}>{labels[index]}</label>
          <Stepper
            ariaLabel={labels[index] ?? part}
            value={value[part]}
            max={maxima[index] ?? 999}
            onChange={(next) => onChange({ ...value, [part]: next })}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * On-screen numeric keypad.
 *
 * The form spec asks for one explicitly. It also keeps the device's own
 * keyboard from covering the form on a small tablet, and it cannot produce a
 * non-digit, so the mobile number field needs no character filtering.
 */
export function NumberPad({
  value,
  onChange,
  length,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  length: number;
  ariaLabel: string;
}) {
  const press = (key: string) => {
    if (key === 'del') onChange(value.slice(0, -1));
    else if (key === 'clr') onChange('');
    else if (value.length < length) onChange(value + key);
  };

  return (
    <div>
      <div className="digits" aria-label={ariaLabel} role="status">
        {Array.from({ length }, (_, index) => (
          <span key={index} className={`slot ${index < value.length ? 'filled' : ''}`}>
            {value[index] ?? ''}
          </span>
        ))}
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <button key={key} type="button" onClick={() => press(key)}>
            {key}
          </button>
        ))}
        <button type="button" className="wide" onClick={() => press('clr')}>
          Clear
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="wide" onClick={() => press('del')} aria-label="Delete">
          ⌫
        </button>
      </div>
    </div>
  );
}

/** Collapsible section, used to keep long screens scannable. */
export function Disclosure({ summary, children, defaultOpen = false }: { summary: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button
        type="button"
        className="btn block"
        style={{ justifyContent: 'space-between', border: 'none', padding: 0, minHeight: 32 }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {summary}
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}
