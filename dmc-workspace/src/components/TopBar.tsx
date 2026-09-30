"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import type { Locale } from "@/lib/locales";

const labels: Record<Locale, string[]> = {
  pt: ["Workspace", "Catálogo", "Histórico", "Referências", "Lixo", "Menu", "Navegação principal"],
  en: ["Workspace", "Catalogue", "History", "References", "Trash", "Menu", "Main navigation"],
  es: ["Workspace", "Catálogo", "Historial", "Referencias", "Papelera", "Menú", "Navegación principal"],
  fr: ["Workspace", "Catalogue", "Historique", "Références", "Corbeille", "Menu", "Navigation principale"],
  de: ["Workspace", "Katalog", "Verlauf", "Referenzen", "Papierkorb", "Menü", "Hauptnavigation"],
  zh: ["工作区", "目录", "历史记录", "参考资料", "回收站", "菜单", "主导航"],
};
const routes = ["/", "/catalog", "/exports", "/references", "/trash"];

export function TopBar({ locale, children }: { locale: Locale; children: ReactNode }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const text = labels[locale];
  const links = () => routes.map((href, index) => {
    const selected = href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    return <Link key={href} href={href} aria-current={selected ? "page" : undefined}
      onClick={() => menu.current?.removeAttribute("open")}
      className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm break-words transition-colors ${selected ? "bg-[#143F4B] text-white" : "text-[#143F4B] hover:bg-[#E3DCD0]"}`}>
      {text[index]}
    </Link>;
  });
  return <header data-testid="top-bar" className="relative z-50 shrink-0 border-b border-[#D5D1C7] bg-[#F4F0E7] px-3 py-2 lg:px-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href="/" aria-label="BLU Costa Travel · Workspace" onClick={() => menu.current?.removeAttribute("open")}
        className="flex min-h-11 items-center gap-2 text-[#143F4B] shrink-0">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-lg bg-[#143F4B] font-serif-blu font-bold text-[#D8A65C]">B</span>
        <span className="hidden sm:block font-serif-blu text-sm font-bold">BLU COSTA<br/><span className="text-xs font-normal">TRAVEL</span></span>
      </Link>
      <nav aria-label={text[6]} className="hidden lg:flex flex-wrap items-center gap-1">{links()}</nav>
      <div className="flex items-center gap-2">
        <details ref={menu} className="lg:hidden" onKeyDown={event => {
          if (event.key === "Escape") { menu.current?.removeAttribute("open"); menu.current?.querySelector("summary")?.focus(); }
        }}>
          <summary className="flex min-h-11 cursor-pointer items-center rounded-lg border border-[#D5D1C7] px-3 text-sm text-[#143F4B]">☰ {text[5]}</summary>
          <nav aria-label={text[6]} className="absolute left-3 right-3 top-full max-h-[65dvh] overflow-auto rounded-b-xl border bg-[#F4F0E7] p-2 shadow-lg">{links()}</nav>
        </details>
        {children}
      </div>
    </div>
  </header>;
}
