import { notFound } from "next/navigation";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experiences } from "@/lib/db/schema";
import { isOptimizableImage } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

async function getExperience(slug: string) {
  const [exp] = await db.select().from(experiences).where(eq(experiences.slug, slug)).limit(1);
  return exp;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const exp = await getExperience(slug);
  if (!exp) return {};
  return { title: exp.title, description: exp.description.slice(0, 155) };
}

export default async function ExperientaPage({ params }: Props) {
  const { slug } = await params;
  const exp = await getExperience(slug);

  if (!exp || exp.status !== "published") notFound();

  return (
    <article className="max-w-2xl mx-auto px-4 py-10">
      {exp.imageUrl && (
        <div className="relative w-full aspect-[16/9] rounded-2xl mb-6 overflow-hidden bg-cream/40">
          <Image
            src={exp.imageUrl}
            alt={exp.title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-cover"
            unoptimized={!isOptimizableImage(exp.imageUrl)}
          />
        </div>
      )}

      {exp.category && (
        <Badge variant="category" category={exp.category}>
          {exp.category}
        </Badge>
      )}

      <h1 className="text-3xl sm:text-4xl font-semibold font-serif text-ink mt-3 mb-4 leading-tight">{exp.title}</h1>

      <p className="text-ink/80 leading-relaxed mb-8 whitespace-pre-wrap">{exp.description}</p>

      <a
        href={exp.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-accent text-white font-semibold px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors"
      >
        Încearcă experiența
        <ArrowUpRight className="w-4 h-4" aria-hidden />
      </a>
    </article>
  );
}
