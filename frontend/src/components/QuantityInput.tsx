"use client";

import { useEffect, useState } from "react";

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string; // names the whole control for screen readers
  decreaseLabel: string;
  increaseLabel: string;
  disabled?: boolean;
  size?: "md" | "sm";
};

// [−] [ 12 ] [+]: customers can tap the buttons or type the number they want.
// The typed number is kept between min and max.
export function QuantityInput({ value, min, max, onChange, label, decreaseLabel, increaseLabel, disabled = false, size = "md" }: Props) {
  // What is in the box while typing (may be empty for a moment).
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  function type(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 4);
    setText(digits);
    if (digits !== "") {
      const clamped = clamp(Number(digits));
      onChange(clamped);
      if (clamped !== Number(digits)) setText(String(clamped)); // e.g. typed 300 with a limit of 200
    }
  }

  const box = size === "sm" ? "h-9" : "h-11";
  const button = size === "sm" ? "w-9 text-lg" : "w-11 text-xl";

  return (
    <div
      role="group"
      aria-label={label}
      className={`flex ${box} shrink-0 items-center border-[1.5px] bg-white ${disabled ? "border-dashed border-[#a8a8a8] text-[#8a8a8a]" : "border-black"}`}
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={`h-full ${button} disabled:opacity-30`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        disabled={disabled}
        value={text}
        onChange={(event) => type(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={() => {
          if (text === "") setText(String(value)); // left empty: show the last valid number again
        }}
        className={`h-full w-12 border-x border-line bg-transparent text-center font-bold outline-none focus-visible:bg-surface ${size === "sm" ? "text-sm" : "text-base"}`}
      />
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={`h-full ${button} disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}
