"use client";
import { T, useLocale, LanguagePicker, useTranslated } from "@/components/LocaleProvider";
import { useWorkspace } from "@/hooks/useWorkspace";

import { MessageCircle, X } from "lucide-react";
import { useState, useRef } from "react";
import { ResponsiveNavigation } from "@/components/ResponsiveNavigation";
import { Sidebar } from "@/components/Sidebar";
import { NewTripScreen } from "@/components/NewTripScreen";
import { ItineraryWorkspace } from "@/components/ItineraryWorkspace";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { applyConfirmation } from "@/lib/activity-confirmation";

export default function WorkspacePage() {
  const { locale } = useLocale();
  const dateLocale = locale === "zh" ? "zh-CN" : locale;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [desktopAssistantCollapsed, setDesktopAssistantCollapsed] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantLabel = useTranslated("Curation Assistant");
  const assistantButton = useRef<HTMLButtonElement>(null);
  const {
    activeId,
    active,
    busy,
    editing,
    ready,
    draft,
    formKey,
    saving,
    exporting,
    error,
    storageError,
    history,
    exportedVersions,
    clientLanguage,
    recent,
    update,
    exportPdf,
    reopenLatest,
    generate,
    send,
    setEditing,
    startNewTrip,
    selectTrip,
    editBrief,
    changeClientLanguage,
  } = useWorkspace();
  return (
    <div className="responsive-workspace relative flex flex-col lg:flex-row h-full bg-[#F4F0E7]">
      <button
        type="button"
        className="lg:hidden shrink-0 min-h-11 px-4 py-2 border-b text-left text-sm bg-[#EBE5DA]"
        aria-expanded={navigationOpen}
        aria-controls="trip-navigation"
        onClick={() => setNavigationOpen((v) => !v)}
      >
        <span aria-hidden="true">☰ </span>
        <T text="Recent Journeys" /> <span aria-hidden="true">{navigationOpen ? "−" : "+"}</span>
      </button>
      <ResponsiveNavigation open={navigationOpen} onClose={() => setNavigationOpen(false)}>
        <div className={busy ? "pointer-events-none opacity-50" : ""}>
          <Sidebar
            currentTripId={activeId}
            recentTrips={recent}
            isNewTripActive={editing}
            onNewTrip={() => {
              setNavigationOpen(false);
              startNewTrip();
            }}
            onSelectTrip={(id) => {
              setNavigationOpen(false);
              selectTrip(id);
            }}
          />
        </div>
      </ResponsiveNavigation>
      <main
        className={`flex-1 min-h-0 min-w-0 overflow-auto ${active && !editing && !busy && !desktopAssistantCollapsed ? "xl:mr-80 2xl:mr-96" : ""}`}
      >
        {(error || storageError) && (
          <p role="alert" className="p-4 text-red-800">
            <T text={error || storageError} source="pt" />
          </p>
        )}
        {busy ? (
          <p role="status" className="p-8">
            <T text="A consultar o catálogo e aplicar os critérios de curadoria…" source="pt" />
          </p>
        ) : !ready ? (
          <p className="p-8">
            <T text="A carregar viagens guardadas…" source="pt" />
          </p>
        ) : editing ? (
          <NewTripScreen
            key={formKey}
            initialValue={draft}
            onGenerate={generate}
            onCancel={active ? () => setEditing(false) : undefined}
          />
        ) : (
          active && (
            <>
              <div className="flex flex-col xl:flex-row items-stretch">
                <ItineraryWorkspace
                  key={active.id}
                  brief={active.brief}
                  itinerary={active.itinerary}
                  displayBudget={`${active.brief.budget.toLocaleString()} EUR · limite, não cotação`}
                  highlightedDay={null}
                  version={active.version}
                  exported={Boolean(
                    exportedVersions[`${active.id}:${active.version}`] ||
                      (history.id === active.id &&
                        history.versions.find((v) => v.version === active.version)?.exportedAt),
                  )}
                  proposalTools={
                    <>
                      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <T text="Idioma do cliente (PDF)" source="pt" />
                        <LanguagePicker
                          value={active.clientLanguage ?? clientLanguage}
                          onChange={changeClientLanguage}
                        />
                        <span className="text-xs">
                          <T
                            text="Inclui sempre a versão em português. Os dois PDFs são descarregados num ZIP."
                            source="pt"
                          />
                        </span>
                      </div>
                      <details className="p-4 text-sm">
                        <summary>
                          <T text="Versões guardadas ·" source="pt" />{" "}
                          {active.version
                            ? `v${String(active.version).padStart(3, "0")}`
                            : "Ainda sem versão no servidor"}
                        </summary>
                        <button
                          type="button"
                          className="underline my-2"
                          onClick={reopenLatest}
                          disabled={saving || exporting}
                        >
                          <T text="Reabrir última versão guardada" source="pt" />
                        </button>
                        {(history.id === activeId ? history.versions : []).map((v) => (
                          <div key={v.version} className="my-2 break-words">
                            <a
                              className="underline"
                              href={`/api/versions?tripId=${encodeURIComponent(activeId)}&version=${v.version}&format=bundle&locale=${active.clientLanguage ?? clientLanguage}`}
                            >
                              {v.filename}
                            </a>
                            <span className="ml-2">
                              {new Date(v.createdAt).toLocaleString(dateLocale)}
                            </span>
                          </div>
                        ))}
                      </details>
                      {saving && (
                        <p role="status" className="px-4">
                          <T text="A guardar nova versão…" source="pt" />
                        </p>
                      )}
                      <details className="p-4 text-sm text-amber-900" open>
                        <summary>
                          <T text="Confirmações pendentes" source="pt" />
                        </summary>
                        <ul className="list-disc pl-5">
                          {active.pending.map((p) => (
                            <li key={p}>
                              <T text={p} source="pt" />
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  }
                  saving={saving || exporting}
                  onConfirmActivity={(dayNumber, id, value) =>
                    update((t) => ({
                      ...t,
                      itinerary: t.itinerary.map((d) =>
                        d.dayNumber === dayNumber
                          ? {
                              ...d,
                              items: d.items.map((i) =>
                                i.id === id ? applyConfirmation(i, value) : i,
                              ),
                            }
                          : d,
                      ),
                    }))
                  }
                  onExportPdf={exportPdf}
                  isExporting={exporting || saving}
                  onEditBrief={editBrief}
                  onToggleLockActivity={(dayNumber, id) =>
                    update((t) => ({
                      ...t,
                      itinerary: t.itinerary.map((d) =>
                        d.dayNumber === dayNumber
                          ? {
                              ...d,
                              items: d.items.map((i) =>
                                i.id === id ? { ...i, isLocked: !i.isLocked } : i,
                              ),
                            }
                          : d,
                      ),
                    }))
                  }
                  onOptimizeDayRoute={(dayNumber) =>
                    send(`otimizar rota do dia ${dayNumber}`)
                  }
                />
                <section
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && assistantOpen) {
                      setAssistantOpen(false);
                      assistantButton.current?.focus();
                    }
                  }}
                  className={`min-w-0 shrink-0 xl:absolute xl:inset-y-0 xl:right-0 ${desktopAssistantCollapsed ? "xl:w-0" : "xl:w-80 2xl:w-96"}`}
                >
                  <button
                    ref={assistantButton}
                    type="button"
                    aria-label={assistantLabel}
                    title={assistantLabel}
                    className={`${desktopAssistantCollapsed ? "" : "xl:hidden"} fixed right-4 z-40 rounded-full bg-[#143F4B] text-[#F4F0E7] border border-[#D8A65C] shadow-xl flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D8A65C]`}
                    style={{
                      width: 56,
                      height: 56,
                      minHeight: 56,
                      bottom: "max(1rem, env(safe-area-inset-bottom))",
                    }}
                    aria-expanded={assistantOpen}
                    aria-controls="curation-assistant"
                    onClick={() => {
                      if (window.matchMedia("(min-width:1280px)").matches) {
                        setDesktopAssistantCollapsed(false);
                        requestAnimationFrame(() =>
                          document.getElementById("curation-assistant")?.focus(),
                        );
                      } else setAssistantOpen((v) => !v);
                    }}
                  >
                    {assistantOpen ? (
                      <X aria-hidden="true" className="size-6" />
                    ) : (
                      <MessageCircle aria-hidden="true" className="size-6" />
                    )}
                  </button>
                  <div
                    id="curation-assistant"
                    tabIndex={-1}
                    role="region"
                    aria-label={assistantLabel}
                    className={`fixed right-4 bottom-20 z-40 w-[calc(100%-2rem)] max-w-sm h-[min(70dvh,36rem)] overflow-hidden rounded-2xl border border-[#D5D1C7] shadow-xl [&>aside]:h-full xl:static xl:w-full xl:max-w-none xl:h-full xl:rounded-none xl:border-0 xl:shadow-none ${assistantOpen ? "block" : "hidden"} ${desktopAssistantCollapsed ? "xl:hidden" : "xl:block"}`}
                  >
                    <AIAssistantPanel
                      onCollapse={() => {
                        setDesktopAssistantCollapsed(true);
                        requestAnimationFrame(() => assistantButton.current?.focus());
                      }}
                      messages={active.messages}
                      onSendMessage={send}
                      isProcessing={saving || exporting}
                      onResetItinerary={editBrief}
                    />
                  </div>
                </section>
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
}
