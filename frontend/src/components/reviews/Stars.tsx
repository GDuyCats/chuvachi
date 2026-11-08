"use client";

import { useState } from "react";

const STAR = "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";

// Black outline star, filled to "fill" (0 to 1), in the site's black-and-white style.
function Star({ fill, size }: { fill: number; size: number }) {
  const id = `star-${Math.round(fill * 100)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="#000000" />
          <stop offset={`${fill * 100}%`} stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${id})`} stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Shows a rating such as 4.5 as five stars.
export function Stars({ value, size = 16, label }: { value: number; size?: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={Math.max(0, Math.min(1, value - (n - 1)))} />
      ))}
    </span>
  );
}

// Five buttons to choose 1 to 5 stars.
export function StarInput({
  value,
  onChange,
  labels,
}: {
  value: number;
  onChange: (value: number) => void;
  labels: string[]; // a word for each number of stars, 1 to 5
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={labels[n - 1]}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="flex h-11 w-11 items-center justify-center"
          >
            <Star size={30} fill={n <= shown ? 1 : 0} />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-semibold">{labels[shown - 1]}</span>}
    </div>
  );
}
