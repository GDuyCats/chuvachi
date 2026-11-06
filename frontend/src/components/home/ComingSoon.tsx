import type { Dictionary } from "@/i18n/dictionaries";

type Props = {
  dict: Dictionary["home"]["comingSoon"];
};

export function ComingSoon({ dict }: Props) {
  return (
    <section id="coming-soon" className="flex flex-col gap-7 px-4 pb-20 md:px-10">
      <h2 className="font-display text-4xl uppercase tracking-wide md:text-[40px]">{dict.title}</h2>
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {dict.items.map((item) => (
          <li key={item.name} className="flex flex-col gap-1.5 border-[1.5px] border-black p-5">
            <span className="text-xs font-bold uppercase tracking-[0.12em]">{item.date}</span>
            <span className="font-display text-2xl uppercase tracking-wide">{item.name}</span>
            <span className="text-sm text-muted">{item.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
