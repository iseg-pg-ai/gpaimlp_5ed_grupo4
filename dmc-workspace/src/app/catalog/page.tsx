"use client";
import { useState } from "react";
import { ChartNoAxesCombined, SlidersHorizontal } from "lucide-react";
import { T } from "@/components/LocaleProvider";
import { CatalogManager } from "@/components/catalog/CatalogManager";
import { CatalogObservatory } from "@/components/catalog/CatalogObservatory";
export default function CatalogPage() {
  const [view, setView] = useState("observatory");
  const [editorOpened, setEditorOpened] = useState(false);
  return (
    <main className="catalog-native-page portal-page">
      <div className="mb-6">
        <p className="obs-eyebrow">BLU COSTA / CONHECIMENTO & CURADORIA</p>
        <h1 className="font-serif-blu text-3xl mt-2">
          <T text="Catálogo" source="pt" />
        </h1>
      </div>
      <div className="catalog-mode-switch" role="group" aria-label="Vista do catálogo">
        <button
          type="button"
          data-testid="catalog-observatory-view"
          aria-pressed={view === "observatory"}
          aria-controls="catalog-observatory-panel"
          onClick={() => setView("observatory")}
        >
          <ChartNoAxesCombined className="size-4" aria-hidden="true" /> Observatório interativo
        </button>
        <button
          type="button"
          data-testid="catalog-editor-view"
          aria-pressed={view === "editor"}
          aria-controls="catalog-editor-panel"
          onClick={() => {
            setEditorOpened(true);
            setView("editor");
          }}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Gerir catálogo
        </button>
      </div>
      <section
        id="catalog-observatory-panel"
        hidden={view !== "observatory"}
        aria-label="Observatório interativo"
      >
        <CatalogObservatory />
      </section>
      <div id="catalog-editor-panel" hidden={view !== "editor"}>
        {editorOpened && <CatalogManager />}
      </div>
    </main>
  );
}
