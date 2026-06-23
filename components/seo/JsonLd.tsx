/**
 * Renders a JSON-LD structured-data block. Server component — safe to drop into
 * any page. Pass a schema object (or array of objects) from the builders in
 * lib/seo.ts.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data);
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here (no user-controlled </script>); the
      // builders escape nothing exotic. Guard the closing tag just in case.
      dangerouslySetInnerHTML={{ __html: json.replace(/</g, "\\u003c") }}
    />
  );
}
