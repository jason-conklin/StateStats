import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const navLinks = [
  { href: "/", label: "Map" },
  { href: "/graph", label: "Graph" },
  { href: "/data-sources", label: "Data Sources" },
  { href: "/about", label: "About" },
];

const siteUrl = "https://www.statestats.us";
const siteDescription = "Interactive maps and charts for exploring U.S. state-level data.";
const previewImageUrl = `${siteUrl}/statestats-banner.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "StateStats",
  description: siteDescription,
  openGraph: {
    title: "StateStats",
    description: siteDescription,
    url: siteUrl,
    siteName: "StateStats",
    type: "website",
    images: [
      {
        url: previewImageUrl,
        width: 1200,
        height: 630,
        alt: "StateStats preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StateStats",
    description: siteDescription,
    images: [previewImageUrl],
  },
};

// Disable static prerendering so database lookups occur only at runtime.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IngestionRunView = {
  dataSourceId: string;
  details: unknown;
  isSynthetic?: boolean;
  note?: string | null;
};

function getRunSyntheticMetadata(run: IngestionRunView) {
  const details =
    run.details && typeof run.details === "object" && !Array.isArray(run.details)
      ? (run.details as Record<string, unknown>)
      : null;
  const mode = typeof details?.mode === "string" ? details.mode : null;
  const detailsFallbackReason =
    typeof details?.fallbackReason === "string" ? details.fallbackReason.trim() : null;
  const note = typeof run.note === "string" && run.note.trim().length > 0 ? run.note.trim() : null;

  const isSynthetic =
    typeof run.isSynthetic === "boolean"
      ? run.isSynthetic
      : mode === "synthetic_fallback" || run.dataSourceId.toLowerCase().includes("synthetic");

  return {
    isSynthetic,
    fallbackReason: note ?? detailsFallbackReason,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let statusText = "Live data auto-ingestion: status unavailable — database unreachable.";
  try {
    const latestIngestion = await prisma.ingestionRun.findFirst({
      where: { status: "success" },
      include: { dataSource: true },
      orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    });

    if (!latestIngestion) {
      statusText = "Live data auto-ingestion: No ingestions yet.";
    } else {
      const maxYearAgg = await prisma.observation.aggregate({ _max: { year: true } });
      const maxObservationYear = maxYearAgg._max.year ?? null;
      const lastUpdatedAt = latestIngestion.completedAt ?? latestIngestion.startedAt;
      const lastUpdatedLabel = formatDateTime(lastUpdatedAt);
      const runView = latestIngestion as unknown as IngestionRunView;
      const syntheticMeta = getRunSyntheticMetadata(runView);

      if (syntheticMeta.isSynthetic) {
        statusText = `Live data auto-ingestion: Synthetic fallback — last run: ${lastUpdatedLabel} — data through ${maxObservationYear ?? "—"}${
          syntheticMeta.fallbackReason ? ` — ${syntheticMeta.fallbackReason}` : ""
        }`;
      } else {
        statusText = `Live data auto-ingestion: Live data — last updated: ${lastUpdatedLabel} — data through ${maxObservationYear ?? "—"}`;
      }
    }
  } catch (error) {
    console.error("RootLayout: Database unavailable; rendering with fallback status.", error);
  }

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-[var(--background)] text-slate-900 antialiased`}>
        <AppShell navLinks={navLinks} statusText={statusText}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
