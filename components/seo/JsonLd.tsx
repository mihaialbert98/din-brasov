/**
 * Renders a JSON-LD structured-data block. Server component — safe to drop into
 * any page. Pass a schema object (or array of objects) from the builders in
 * lib/seo.ts.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  // Drop any null/undefined entries so we never emit a malformed schema object
  // (a bad element makes third-party schema readers / SEO extensions choke on
  // `@context`). Skip rendering entirely if nothing valid remains.
  const items = (Array.isArray(data) ? data : [data]).filter(
    (d): d is object => d != null && typeof d === "object"
  );
  if (items.length === 0) return null;

  const json = JSON.stringify(items.length === 1 ? items[0] : items);
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here (no user-controlled </script>); the
      // builders escape nothing exotic. Guard the closing tag just in case.
      dangerouslySetInnerHTML={{ __html: json.replace(/</g, "\\u003c") }}
    />
  );
}
