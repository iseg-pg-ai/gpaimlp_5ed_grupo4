import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/components/LocaleProvider";

export const metadata: Metadata = {
  title: "BLU Costa — AI Travel Curation Studio",
  description: "Private journeys through Portugal, practiced as curation. AI workspace for BLU Costa travel curators.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" className="h-full">
      <body className="h-full min-h-screen bg-[#F4F0E7] text-[#143F4B] antialiased selection:bg-[#D8A65C]/30 selection:text-[#143F4B]">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
