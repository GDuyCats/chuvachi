import type { HomeContent } from "@/lib/api";

type Props = {
  title: string;
  items: HomeContent["comingSoon"];
};

export function ComingSoon({ title, items }: Props) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section id="coming-soon" className="flex flex-col gap-7 px-4 pb-20 md:px-10">
      <h2 className="font-display text-4xl uppercase tracking-wide md:text-[40px]">{title}</h2>
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5 border-[1.5px] border-black p-5">
            <span className="text-xs font-bold uppercase tracking-[0.12em]">{item.dateLabel}</span>
            <span className="font-display text-2xl uppercase tracking-wide">{item.name}</span>
            {item.note && <span className="text-sm text-muted">{item.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
