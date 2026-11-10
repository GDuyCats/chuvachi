"use client";

import { useState } from "react";
import { QuantityInput } from "../QuantityInput";

export type MixFlavor = { id: number; name: string; available: boolean };

type Labels = {
  mixProgress: string; // "{done}/{size} portions chosen"
  saveMix: string;
  cancelMix: string;
  soldOut: string;
  decrease: string;
  increase: string;
};

type Props = {
  flavors: MixFlavor[];
  boxSize: number;
  initial: Record<number, number>; // portions of each flavor in one box
  labels: Labels;
  onSave: (mix: Record<number, number>) => void;
  onCancel: () => void;
};

// Changes how one box is split between flavors, right in the order summary.
// Saving needs the box to be full again (e.g. 6/6).
export function MixEditor({ flavors, boxSize, initial, labels, onSave, onCancel }: Props) {
  const [mix, setMix] = useState<Record<number, number>>(initial);
  const filled = flavors.reduce((sum, f) => sum + (f.available ? (mix[f.id] ?? 0) : 0), 0);

  function set(id: number, value: number) {
    setMix((current) => {
      const others = flavors.reduce((sum, f) => (f.id === id || !f.available ? sum : sum + (current[f.id] ?? 0)), 0);
      return { ...current, [id]: Math.max(0, Math.min(boxSize - others, value)) };
    });
  }

  return (
    <div className="flex flex-col gap-2 border-[1.5px] border-black bg-white p-3">
      <p aria-live="polite" className={`text-[13px] font-bold ${filled === boxSize ? "" : "text-muted"}`}>
        {labels.mixProgress.replace("{done}", String(filled)).replace("{size}", String(boxSize))}
      </p>
      <ul className="flex flex-col">
        {flavors.map((flavor) => {
          const value = flavor.available ? (mix[flavor.id] ?? 0) : 0;
          return (
            <li key={flavor.id} className="flex items-center justify-between gap-2 py-1">
              <span className={`text-sm ${flavor.available ? "font-semibold" : "text-[#8a8a8a]"}`}>
                {flavor.name}
                {!flavor.available && <span className="ml-1.5 text-[11px] font-bold uppercase">{labels.soldOut}</span>}
              </span>
              <QuantityInput
                size="sm"
                value={value}
                min={0}
                max={value + (boxSize - filled)}
                onChange={(next) => set(flavor.id, next)}
                label={flavor.name}
                decreaseLabel={labels.decrease}
                increaseLabel={labels.increase}
                disabled={!flavor.available}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={filled !== boxSize}
          onClick={() => onSave(mix)}
          className="min-h-10 bg-black px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          {labels.saveMix}
        </button>
        <button type="button" onClick={onCancel} className="min-h-10 px-2 text-sm font-semibold underline">
          {labels.cancelMix}
        </button>
      </div>
    </div>
  );
}
