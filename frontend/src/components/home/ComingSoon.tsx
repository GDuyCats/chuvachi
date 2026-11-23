import type { HomeContent } from "@/lib/api";
import { DragScroller } from "../DragScroller";

type Props = {
  title: string;
  scrollLabel: string;
  items: HomeContent["comingSoon"];
};

// One row of upcoming cakes: swipe it on phones, drag it with the mouse on computers.
// Up to three fit side by side on a big screen; more peek in at the edge.
export function ComingSoon({ title, scrollLabel, items }: Props) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section id="coming-soon" className="flex flex-col gap-7 px-4 pb-20 md:px-10">
      <h2 className="font-display text-4xl uppercase tracking-wide md:text-[40px]">{title}</h2>
      <DragScroller
        role="region"
        aria-label={`${title}: ${scrollLabel}`}
        tabIndex={0}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto md:gap-5"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="flex w-[80%] shrink-0 snap-start flex-col gap-1.5 border-[1.5px] border-black p-5 sm:w-[45%] xl:w-[calc((100%-40px)/3)]"
          >
            <span className="text-xs font-bold uppercase tracking-[0.12em]">{item.dateLabel}</span>
            <span className="font-display text-2xl uppercase tracking-wide">{item.name}</span>
            {item.note && <span className="text-sm text-muted">{item.note}</span>}
          </div>
        ))}
      </DragScroller>
    </section>
  );
}
