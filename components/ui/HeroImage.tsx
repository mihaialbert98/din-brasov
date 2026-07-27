import FramedImage from "@/components/ui/FramedImage";

/**
 * Fixed 16:9 hero image (detail pages) that looks good for any aspect ratio — a
 * portrait photo shows whole with a soft blurred margin on the left and right, a
 * landscape 16:9 photo fills the box exactly. The height is unchanged. Thin wrapper
 * over {@link FramedImage}.
 */
export default function HeroImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <FramedImage
      src={src}
      alt={alt}
      priority
      sizes="(max-width: 768px) 100vw, 672px"
      frameClassName={`relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-cream/40 ${className}`}
    />
  );
}
