type Props = {
  categories: string[];
  active: string | undefined;
  basePath: string;
  paramName?: string;
  extraParams?: Record<string, string>;
};

export default function CategoryFilter({ categories, active, basePath, paramName = "categorie", extraParams }: Props) {
  function buildHref(cat?: string) {
    const sp = new URLSearchParams(extraParams);
    if (cat) sp.set(paramName, cat);
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-8">
      <a
        href={buildHref()}
        className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
          !active ? "bg-[#1a4731] text-white border-[#1a4731]" : "border-gray-300 hover:border-[#1a4731]"
        }`}
      >
        Toate
      </a>
      {categories.map((cat) => (
        <a
          key={cat}
          href={buildHref(cat)}
          className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
            active === cat ? "bg-[#1a4731] text-white border-[#1a4731]" : "border-gray-300 hover:border-[#1a4731]"
          }`}
        >
          {cat}
        </a>
      ))}
    </div>
  );
}
