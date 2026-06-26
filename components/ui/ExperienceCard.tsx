import Link from "next/link";

const CATEGORY_COLORS: Record<string, string> = {
  "Aventură": "bg-orange-100 text-orange-700",
  "Sport": "bg-blue-100 text-blue-700",
  "Cultură": "bg-purple-100 text-purple-700",
  "Gastronomie": "bg-yellow-100 text-yellow-700",
  "Natură": "bg-green-100 text-green-700",
  "Altele": "bg-gray-100 text-gray-700",
};

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
    <Link
      href={`/experiente/${exp.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
    >
      {exp.imageUrl ? (
        <img src={exp.imageUrl} alt={exp.title} className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300" />
      ) : (
        <div className="w-full h-44 bg-gradient-to-br from-[#e8d9c5] to-[#c84b1e]/20 flex items-center justify-center">
          <span className="text-4xl" aria-hidden>🎯</span>
        </div>
      )}
      <div className="p-4">
        {exp.category && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[exp.category] ?? "bg-gray-100 text-gray-700"}`}>
            {exp.category}
          </span>
        )}
        <h2 className="font-semibold text-gray-900 mt-2 line-clamp-2">{exp.title}</h2>
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{exp.description}</p>
        <span className="inline-block mt-3 text-sm font-semibold text-[#c84b1e]">
          Descoperă →
        </span>
      </div>
    </Link>
  );
}
