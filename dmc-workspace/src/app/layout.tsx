import type { Metadata } from "next";
import "./globals.css";
import { themeInitScript } from "@/lib/theme";
import { LocaleProvider } from "@/components/LocaleProvider";

export const metadata: Metadata = {
  icons: {
    icon: `${process.env.PORTAL_ASSET_PREFIX ?? (process.env.SAGEMAKER_APP_TYPE === "CodeEditor" ? "/codeeditor/default/ports/3001" : "")}/favicon.svg`,
  },
  title: "BLU · Curation Studio",
  description:
    "Private journeys through Portugal, practiced as curation. AI workspace for BLU Costa travel curators.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* Extensões como Grammarly acrescentam atributos ao body antes da hidratação. */}
      <body
        suppressHydrationWarning
        className="blu-studio h-full min-h-screen bg-[var(--portal-bg-f4f0e7)] text-[var(--portal-text-143f4b)] antialiased selection:bg-[#D8A65C]/30 selection:text-[var(--portal-text-143f4b)]"
      >
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
