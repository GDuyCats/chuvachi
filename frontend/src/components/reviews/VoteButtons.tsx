"use client";

type Props = {
  up: number;
  down: number;
  myVote: number; // 1, 0 or -1
  onVote: (value: -1 | 0 | 1) => void;
  labels: { upvote: string; downvote: string };
  disabled?: boolean;
};

// Up and down vote, like Reddit: tap again to take the vote back. Shows up minus down.
export function VoteButtons({ up, down, myVote, onVote, labels, disabled = false }: Props) {
  const button = (active: boolean) =>
    `flex h-9 w-9 items-center justify-center border-[1.5px] ${active ? "border-black bg-black text-white" : "border-transparent hover:border-black"} disabled:opacity-40`;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={labels.upvote}
        aria-pressed={myVote === 1}
        disabled={disabled}
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
        className={button(myVote === 1)}
      >
        <Chevron up />
      </button>
      <span className="min-w-6 text-center text-sm font-bold" aria-live="polite">
        {up - down}
      </span>
      <button
        type="button"
        aria-label={labels.downvote}
        aria-pressed={myVote === -1}
        disabled={disabled}
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
        className={button(myVote === -1)}
      >
        <Chevron up={false} />
      </button>
    </div>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
