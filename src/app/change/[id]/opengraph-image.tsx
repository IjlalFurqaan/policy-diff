import { ImageResponse } from "next/og";

import { formatDate } from "@/lib/format";
import { getChange } from "@/lib/queries";
import { SEVERITY_LABELS, TAG_LABELS, isChangeTag } from "@/lib/tags";

export const alt = "A change to a company's terms of service or privacy policy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share surface. Satori supports a flexbox subset only — no CSS variables,
 * no grid, no shorthand-heavy styles — so everything here is literal.
 */
const PALETTE = {
  background: "#0B1120",
  panel: "#111C33",
  border: "#1E2A44",
  text: "#F1F5F9",
  muted: "#94A3B8",
};

const SEVERITY_COLORS: Record<number, string> = {
  1: "#64748B",
  2: "#38BDF8",
  3: "#FBBF24",
  4: "#FB923C",
  5: "#F87171",
};

/** Satori cannot fetch over the network reliably; inline the bytes instead. */
async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/png";
    if (!/^image\/(png|jpeg|jpg|gif|webp)/i.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 512_000) return null;
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const change = await getChange(id);

  if (!change) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: PALETTE.background,
            color: PALETTE.text,
            fontSize: 48,
          }}
        >
          Policy Diff
        </div>
      ),
      size,
    );
  }

  const severity = change.severity ?? 3;
  const severityColor = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS[3];
  const logo = await logoDataUri(change.companyLogoUrl);
  const tags = change.tags.filter(isChangeTag).slice(0, 3);
  const documentLabel =
    change.documentType === "tos" ? "Terms of Service" : "Privacy Policy";

  // Long headlines need to shrink rather than overflow the card.
  const headlineSize =
    change.headline.length > 110 ? 46 : change.headline.length > 70 ? 54 : 64;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PALETTE.background,
          padding: 64,
          color: PALETTE.text,
          fontFamily: "sans-serif",
        }}
      >
        {/* Company */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {logo ? (
            // Satori renders this to a PNG on the server — next/image has no
            // meaning here, and its output would not be rasterised.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              width={72}
              height={72}
              style={{ borderRadius: 14, background: "#FFFFFF" }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 14,
                background: PALETTE.panel,
                border: `1px solid ${PALETTE.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              {change.companyName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700 }}>{change.companyName}</div>
            {/* One interpolation, not three: Satori refuses a div with several
                children unless it declares an explicit display. */}
            <div style={{ fontSize: 22, color: PALETTE.muted }}>
              {`${documentLabel} · ${formatDate(change.detectedAt)}`}
            </div>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            fontSize: headlineSize,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: -1,
            maxHeight: 300,
            overflow: "hidden",
          }}
        >
          {change.headline}
        </div>

        {/* Severity + tags */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((step) => (
                <div
                  key={step}
                  style={{
                    width: 34,
                    height: 12,
                    borderRadius: 6,
                    background: step <= severity ? severityColor : PALETTE.border,
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: severityColor }}>
              {SEVERITY_LABELS[severity] ?? "Notable"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {tags.map((tag) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  fontSize: 20,
                  color: PALETTE.muted,
                  border: `1px solid ${PALETTE.border}`,
                  background: PALETTE.panel,
                  borderRadius: 999,
                  padding: "8px 18px",
                }}
              >
                {TAG_LABELS[tag]}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderTop: `1px solid ${PALETTE.border}`,
            paddingTop: 24,
            fontSize: 24,
            color: PALETTE.muted,
          }}
        >
          <div style={{ display: "flex", fontWeight: 700, color: PALETTE.text }}>Policy Diff</div>
          <div style={{ display: "flex" }}>what changed in the terms you agreed to</div>
        </div>
      </div>
    ),
    size,
  );
}
