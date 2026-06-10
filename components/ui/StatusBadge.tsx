const LISTING_STATUS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  sold: "bg-blue-100 text-blue-700",
  expired: "bg-gray-100 text-gray-500",
  suspended: "bg-red-100 text-red-700",
  removed: "bg-gray-100 text-gray-400",
  draft: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const ROLE_COLORS: Record<string, string> = {
  user: "bg-gray-100 text-gray-700",
  staff: "bg-blue-100 text-blue-700",
  moderator: "bg-purple-100 text-purple-700",
  admin: "bg-red-100 text-red-700",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const color =
    LISTING_STATUS[status] ?? ROLE_COLORS[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {label}
    </span>
  );
}
