import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experiences } from "@/lib/db/schema";
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
        <img src={exp.imageUrl} alt={exp.title} className="w-full rounded-xl mb-6 max-h-80 object-cover" />
      )}

      {exp.category && (
        <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">
          {exp.category}
        </span>
      )}

      <h1 className="text-3xl font-bold font-serif text-gray-900 mt-3 mb-4">{exp.title}</h1>

      <p className="text-gray-700 leading-relaxed mb-8 whitespace-pre-wrap">{exp.description}</p>

      <a
        href={exp.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-[#c84b1e] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#d9603a] transition-colors"
      >
        Încearcă experiența →
      </a>
    </article>
  );
}
