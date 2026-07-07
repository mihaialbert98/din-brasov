import Link from "next/link";
import Image from "next/image";
import { Compass, ArrowRight } from "lucide-react";
import { isOptimizableImage } from "@/lib/utils";
import { cardShell, cardImageFrame, cardImageZoom } from "@/lib/ui";
import Badge from "@/components/ui/Badge";

type Props = {
  experience: {
    id: string;
    slug: string;
    title: string;
    category: string | null;
    imageUrl: string | null;
    description: string;
  };
};

export default function ExperienceCard({ experience: exp }: Props) {
  return (
    <Link href={`/experiente/${exp.slug}`} className={cardShell("flex flex-col")}>
      {exp.imageUrl ? (
        <div className={cardImageFrame}>
          <Image
            src={exp.imageUrl}
            alt={exp.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className={cardImageZoom}
            unoptimized={!isOptimizableImage(exp.imageUrl)}
          />
        </div>
      ) : (
        <div className="w-full aspect-[3/2] bg-gradient-to-br from-cream/70 to-accent-soft flex items-center justify-center">
          <Compass className="w-11 h-11 text-accent/40" aria-hidden />
        </div>
      )}
      <div className="p-5 flex flex-col gap-2 flex-1">
        {exp.category && (
          <div>
            <Badge variant="category" category={exp.category}>
              {exp.category}
            </Badge>
          </div>
        )}
        <h2 className="font-serif font-semibold text-ink line-clamp-2 leading-snug">{exp.title}</h2>
        <p className="text-sm text-muted line-clamp-2">{exp.description}</p>
        <span className="group mt-1 inline-flex items-center gap-1 text-sm font-semibold text-accent">
          Descoperă
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
