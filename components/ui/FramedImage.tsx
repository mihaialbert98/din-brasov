import Image from "next/image";
import { isOptimizableImage } from "@/lib/utils";

/**
 * Image that looks good for ANY aspect ratio inside a fixed frame: a blurred,
 * cover-fit copy fills the frame while the full photo sits on top via object-contain.
 * A PORTRAIT photo shows whole with a soft blurred margin left/right instead of being
 * cropped; a photo matching the frame fills it exactly. `frameClassName` sets the box
 * (must include `relative`, an aspect ratio, and `overflow-hidden`). Pass `zoom` for
 * the subtle hover scale used on cards (needs a `group` ancestor).
 */
export default function FramedImage({
  src,
  alt,
  sizes,
  frameClassName,
  priority = false,
  zoom = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  frameClassName: string;
  priority?: boolean;
  zoom?: boolean;
}) {
  const unoptimized = !isOptimizableImage(src);
  return (
    <div className={frameClassName}>
      {/* Blurred fill — hidden under a frame-matching photo, visible as the margins otherwise. */}
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className="object-cover scale-110 blur-2xl opacity-70"
        unoptimized={unoptimized}
      />
      {/* The full photo — never cropped. */}
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={`object-contain${zoom ? " transition-transform duration-300 ease-out group-hover:scale-[1.04]" : ""}`}
        unoptimized={unoptimized}
      />
    </div>
  );
}
