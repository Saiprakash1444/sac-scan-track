import { useEffect, useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max"> & {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
};

// Keeps the typed text separately so the field can be cleared while editing;
// the committed value is clamped to [min, max] and restored on blur.
export function NumberInput({ value, onValueChange, min, max, onBlur, ...props }: NumberInputProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (current === "" || Number(current) !== value ? String(value) : current));
  }, [value]);

  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          setText("");
          return;
        }
        const next = Math.min(max, Math.max(min, Math.floor(Number(raw))));
        if (Number.isNaN(next)) return;
        setText(Number(raw) > max ? String(max) : raw);
        onValueChange(next);
      }}
      onBlur={(e) => {
        setText(String(value));
        onBlur?.(e);
      }}
    />
  );
}
