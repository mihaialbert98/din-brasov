/**
 * Dynamic branded Open Graph image (1200×630) — used as the default/fallback
 * share preview for pages without their own image. Branded with the Din Brașov
 * wordmark and terracotta palette.
 *
 *   /og?title=...&section=...
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";

const TERRACOTTA = "#c84b1e";
const CREAM = "#e8d9c5";
const DARK = "#1a1a1a";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "Tot ce se întâmplă în Brașov").slice(0, 110);
  const section = searchParams.get("section") ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: TERRACOTTA,
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 800, color: "#ffffff" }}>
          Din <span style={{ color: CREAM, marginLeft: 12 }}>Brașov</span>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {section ? (
            <div style={{ fontSize: 28, color: CREAM, textTransform: "uppercase", letterSpacing: 2 }}>{section}</div>
          ) : null}
          <div style={{ fontSize: 64, fontWeight: 800, color: "#ffffff", lineHeight: 1.15 }}>{title}</div>
        </div>

        {/* Footer bar */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: CREAM }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: DARK, marginRight: 14 }} />
          dinbrasov.com — platforma civică a brașovenilor
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
