// Reúne os controlos globais do portal e o contexto da área aberta.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { Compass, Library, Archive, Trash2, LayoutGrid } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Locale } from "@/lib/locales";

const labels: Record<Locale, string[]> = {
  pt: ["Workspace", "Catálogo", "Histórico", "Lixo", "Menu", "Navegação principal"],
  en: ["Workspace", "Catalogue", "History", "Trash", "Menu", "Main navigation"],
  es: ["Workspace", "Catálogo", "Historial", "Papelera", "Menú", "Navegación principal"],
  fr: ["Workspace", "Catalogue", "Historique", "Corbeille", "Menu", "Navigation principale"],
  de: ["Workspace", "Katalog", "Verlauf", "Papierkorb", "Menü", "Hauptnavigation"],
  zh: ["工作区", "目录", "历史记录", "回收站", "菜单", "主导航"],
};
// Os contactos (leads) vivem na intranet; o portal fica para propostas e catálogo.
const icons = [Compass, Library, Archive, Trash2];
const routes = ["/", "/catalog", "/exports", "/trash"];
// Endereço da intranet, fixado no build da AWS (BluCostaIntranet); sem ele, a ligação não aparece.
const intranetUrl = process.env.NEXT_PUBLIC_INTRANET_URL ?? "";

export function TopBar({ locale, children }: { locale: Locale; children: ReactNode }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const text = labels[locale];
  const links = () =>
    routes
      .map((href, index) => {
        const selected =
          href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        const Icon = icons[index];
        return (
          <Link
            key={href}
            href={href}
            aria-current={selected ? "page" : undefined}
            onClick={() => menu.current?.removeAttribute("open")}
            className={`studio-nav-link flex min-h-11 items-center rounded-lg px-3 py-2 text-sm break-words transition-colors ${selected ? "bg-[var(--portal-bg-143f4b)] text-white" : "text-[var(--portal-text-143f4b)] hover:bg-[var(--portal-bg-e3dcd0)]"}`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {text[index]}
          </Link>
        );
      })
      .concat(
        intranetUrl ? (
          <a
            key="intranet"
            href={intranetUrl}
            className="studio-nav-link flex min-h-11 items-center rounded-lg px-3 py-2 text-sm break-words transition-colors text-[var(--portal-text-143f4b)] hover:bg-[var(--portal-bg-e3dcd0)]"
          >
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0" />
            Intranet ↗
          </a>
        ) : (
          []
        ),
      );
  return (
    <header
      data-testid="top-bar"
      className="studio-topbar relative z-50 shrink-0 border-b border-[var(--portal-line-d5d1c7)] bg-[var(--portal-bg-f4f0e7)] py-2"
    >
      <div className="portal-frame portal-header-content flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          aria-label="BLU Costa Travel · Workspace"
          onClick={() => menu.current?.removeAttribute("open")}
          className="flex min-h-11 items-center gap-2 text-[var(--portal-text-143f4b)] shrink-0"
        >
          <span className="studio-wordmark">
            blu<span aria-hidden="true">.</span>
          </span>
          <span className="studio-brand-caption hidden sm:block">
            COSTA TRAVEL
            <br />
            CURATION STUDIO
          </span>
        </Link>
        <nav aria-label={text[5]} className="hidden lg:flex flex-wrap items-center gap-1">
          {links()}
        </nav>
        <div className="flex items-center gap-2">
          <details
            ref={menu}
            className="lg:hidden"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                menu.current?.removeAttribute("open");
                menu.current?.querySelector("summary")?.focus();
              }
            }}
          >
            <summary className="flex min-h-11 cursor-pointer items-center rounded-lg border border-[var(--portal-line-d5d1c7)] px-3 text-sm text-[var(--portal-text-143f4b)]">
              ☰ {text[4]}
            </summary>
            <nav
              aria-label={text[5]}
              className="absolute left-3 right-3 top-full max-h-[65dvh] overflow-auto rounded-b-xl border bg-[var(--portal-bg-f4f0e7)] p-2 shadow-lg"
            >
              {links()}
            </nav>
          </details>
          <ThemeToggle locale={locale} />
          {children}
        </div>
      </div>
    </header>
  );
}
