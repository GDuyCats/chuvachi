import { FadeInImage } from "./FadeInImage";

type Props = {
  src: string | null;
  alt: string;
  fallbackText: string;
  className?: string;
  sizes?: string;
};

// Shows a product photo, or a calm placeholder until real photos are uploaded.
export function PhotoBox({ src, alt, fallbackText, className = "", sizes = "(min-width: 768px) 33vw, 80vw" }: Props) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-white text-[13px] text-[#767676] ${className}`}>
        {fallbackText}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
      {/* Inside a card (class "group"), the photo zooms in slightly on hover. */}
      <FadeInImage
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover group-hover:scale-[1.04]"
      />
    </div>
  );
}
