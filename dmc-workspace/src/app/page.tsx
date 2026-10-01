"use client";
import { T, useLocale, LanguagePicker, useTranslated } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/locales";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { ResponsiveNavigation } from "@/components/ResponsiveNavigation";
import { Sidebar } from "@/components/Sidebar";
import { NewTripScreen } from "@/components/NewTripScreen";
import { ItineraryWorkspace } from "@/components/ItineraryWorkspace";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import type { CustomerBrief, ItineraryDay, ChatMessage, RecentTrip } from "@/types";
import { initialBrief } from "@/data/mockData";
import { validateBrief, applyCommand } from "@/lib/curation";

type Trip = { clientLanguage?: Locale; version?: number; id: string; brief: CustomerBrief; itinerary: ItineraryDay[]; pending: string[]; messages: ChatMessage[] };
type HistoryVersion = { version: number; filename: string; createdAt: string };
const STORAGE = "blu-trips-v1";
const emptyBrief = (): CustomerBrief => ({ ...initialBrief, customerName: "", destination: "", startDate: "", endDate: "", arrivalLocation: "", departureLocation: "", interests: [], mobilityRestrictions: [], dietaryRestrictions: [], exclusions: [], specialOccasion: "", notes: "", childrenAges: "" });
const message = (sender: ChatMessage["sender"], text: string): ChatMessage => ({ id: crypto.randomUUID(), sender, text, timestamp: new Date().toLocaleTimeString() });
export default function WorkspacePage() {
  const { locale } = useLocale();
  const dateLocale = locale === "zh" ? "zh-CN" : locale;
  const [clientLanguage, setClientLanguage] = useState<Locale>("en");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeId, setActiveId] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantLabel = useTranslated("Curation Assistant");
  const assistantButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<CustomerBrief>(emptyBrief);
  const [formKey, setFormKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const operation = useRef(false);
  const [history, setHistory] = useState<{ id: string; versions: HistoryVersion[] }>({ id: "", versions: [] });
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const active = trips.find(t => t.id === activeId);
  useEffect(() => {
    const timer = setTimeout(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const saved: Trip[] = JSON.parse(raw);
        if (!Array.isArray(saved)) throw new Error();
        for (const t of saved) {
          validateBrief(t.brief);
          if (typeof t.id !== "string" || !Array.isArray(t.itinerary) || !Array.isArray(t.pending) || !Array.isArray(t.messages)) throw new Error();
        }
        setTrips(saved);
      }
      setReady(true);
    } catch { setStorageError("Não foi possível ler as viagens guardadas. Os dados existentes não serão substituídos; exporte ou recupere o armazenamento do navegador antes de continuar."); }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE, JSON.stringify(trips)); queueMicrotask(() => setStorageError("")); }
    catch { queueMicrotask(() => setStorageError("Não foi possível guardar no navegador. Mantenha esta página aberta para não perder as alterações.")); }
  }, [trips, ready]);
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/versions?tripId=${encodeURIComponent(activeId)}`).then(async response => {
      if (!response.ok) throw new Error("Não foi possível carregar o histórico.");
      return response.json();
    }).then(versions => { if (!cancelled) setHistory({ id: activeId, versions }); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [activeId, active?.version]);
  const saveVersion = async (trip: Trip, reason: string) => {
    const response = await fetch("/api/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, baseVersion: trip.version ?? null, reason, snapshot: { brief: trip.brief, itinerary: trip.itinerary, pending: trip.pending } }) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        const historyResponse = await fetch(`/api/versions?tripId=${encodeURIComponent(trip.id)}`);
        if (historyResponse.ok) setHistory({ id: trip.id, versions: await historyResponse.json() });
      }
      throw new Error(result.error);
    }
    return { ...trip, version: result.version as number };
  };
  const update = async (fn: (trip: Trip) => Trip) => {
    if (!active || operation.current) return;
    operation.current = true; setSaving(true); setError("");
    try {
      const changed = await saveVersion(fn(active), "edited");
      setTrips(prev => prev.map(t => t.id === changed.id ? changed : t));
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível guardar a alteração."); }
    finally { operation.current = false; setSaving(false); }
  };
  const exportPdf = async () => {
    if (!active || operation.current) return;
    operation.current = true; setExporting(true); setError("");
    try {
      const saved = await saveVersion(active, "export");
      setTrips(prev => prev.map(t => t.id === saved.id ? saved : t));
      const response = await fetch(`/api/versions?tripId=${encodeURIComponent(saved.id)}&version=${saved.version}&format=bundle&locale=${active.clientLanguage ?? clientLanguage}`);
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "roteiro.zip";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na exportação."); }
    finally { operation.current = false; setExporting(false); }
  };
  const reopenLatest = async () => {
    const latest = history.id === activeId ? history.versions[0] : undefined;
    if (!latest || !active || operation.current) return;
    operation.current = true; setSaving(true);
    try {
      const response = await fetch(`/api/versions?tripId=${encodeURIComponent(activeId)}&version=${latest.version}`);
      if (!response.ok) throw new Error("Não foi possível reabrir a versão.");
      const result = await response.json();
      const restored = { ...active, ...result.snapshot, version: result.meta.version };
      setTrips(prev => prev.map(t => t.id === restored.id ? restored : t)); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao reabrir."); }
    finally { operation.current = false; setSaving(false); }
  };
  const generate = async (brief: CustomerBrief) => {
    if (busy || operation.current) return;
    setError("");
    if (active?.itinerary.some(d => d.items.some(i => i.isLocked))) {
      setError("Existem atividades bloqueadas. Desbloqueie-as antes de regenerar a proposta; a viagem atual foi preservada."); return;
    }
    setDraft(brief);
    setBusy(true); operation.current = true;
    try {
      const response = await fetch("/api/itineraries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const trip: Trip = { clientLanguage: active?.clientLanguage ?? clientLanguage, version: active?.version, id: activeId || crypto.randomUUID(), brief, itinerary: result.itinerary, pending: result.pending, messages: [message("assistant", "Rascunho gerado a partir do catálogo real. Consulte a origem de cada sugestão e as confirmações pendentes. Para alterar preferências, use Edit Brief. Pode pedir: remover última atividade do dia 2; os bloqueios são respeitados.")] };
      const saved = await saveVersion(trip, "generated");
      setTrips(prev => [...prev.filter(t => t.id !== saved.id), saved]);
      setActiveId(trip.id); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na geração. Tente novamente."); }
    finally { setBusy(false); operation.current = false; }
  };
  const send = (input: string) => update(trip => {
    const { itinerary, reply } = applyCommand(trip.itinerary, input);
    return { ...trip, itinerary, messages: [...trip.messages, message("user", input), message("assistant", reply)] };
  });
  const recent: RecentTrip[] = trips.map(t => ({ id: t.id, name: t.brief.customerName, destination: t.brief.destination, dates: `${t.brief.startDate} – ${t.brief.endDate}`, budget: `${t.brief.budget} EUR`, tier: t.brief.proposalTier, status: "Draft" }));
  return <div className="responsive-workspace relative flex flex-col lg:flex-row h-full bg-[#F4F0E7]">
    <button type="button" className="lg:hidden shrink-0 min-h-11 px-4 py-2 border-b text-left text-sm bg-[#EBE5DA]" aria-expanded={navigationOpen} aria-controls="trip-navigation" onClick={()=>setNavigationOpen(v=>!v)}><span aria-hidden="true">☰ </span><T text="Recent Journeys"/> <span aria-hidden="true">{navigationOpen ? "−" : "+"}</span></button>
    <ResponsiveNavigation open={navigationOpen} onClose={()=>setNavigationOpen(false)}><div className={busy ? "pointer-events-none opacity-50" : ""}><Sidebar currentTripId={activeId} recentTrips={recent} isNewTripActive={editing}
      onNewTrip={() => { setNavigationOpen(false); if (busy || operation.current) return; setActiveId(""); setDraft(emptyBrief()); setEditing(true); setFormKey(k => k + 1); setError(""); }}
      onSelectTrip={id => { setNavigationOpen(false); if (busy || operation.current) return; setActiveId(id); setEditing(false); setError(""); }} /></div></ResponsiveNavigation>
    <main className={`flex-1 min-h-0 min-w-0 overflow-auto ${active && !editing && !busy ? "xl:mr-80 2xl:mr-96" : ""}`}>
      <div className="p-3 text-xs bg-amber-50"><T text="Propostas preliminares · Versões guardadas no servidor local · Sem reservas ou preços finais confirmados." source="pt"/></div>
      {(error || storageError) && <p role="alert" className="p-4 text-red-800"><T text={error || storageError} source="pt"/></p>}
      {busy ? <p role="status" className="p-8"><T text="A consultar o catálogo e aplicar os critérios de curadoria…" source="pt"/></p> : !ready ? <p className="p-8"><T text="A carregar viagens guardadas…" source="pt"/></p> : editing ?
        <NewTripScreen key={formKey} initialValue={draft} onGenerate={generate} onCancel={active ? () => setEditing(false) : undefined} /> : active && <>
          <div className="px-4 py-3 flex flex-wrap items-center gap-3"><T text="Idioma do cliente (PDF)" source="pt"/><LanguagePicker value={active.clientLanguage ?? clientLanguage} onChange={language=>{setClientLanguage(language);setTrips(prev=>prev.map(t=>t.id===activeId?{...t,clientLanguage:language}:t));}}/><span className="text-xs"><T text="Inclui sempre a versão em português. Os dois PDFs são descarregados num ZIP." source="pt"/></span></div>
          <details className="p-4 text-sm"><summary><T text="Versões guardadas ·" source="pt"/>{" "}{active.version ? `v${String(active.version).padStart(3,"0")}` : "Ainda sem versão no servidor"}</summary>
            <button type="button" className="underline my-2" onClick={reopenLatest} disabled={saving || exporting}><T text="Reabrir última versão guardada" source="pt"/></button>
            {(history.id === activeId ? history.versions : []).map(v => <div key={v.version} className="my-2 break-words"><a className="underline" href={`/api/versions?tripId=${encodeURIComponent(activeId)}&version=${v.version}&format=bundle&locale=${active.clientLanguage ?? clientLanguage}`}>{v.filename}</a><span className="ml-2">{new Date(v.createdAt).toLocaleString(dateLocale)}</span></div>)}
          </details>
          {saving && <p role="status" className="px-4"><T text="A guardar nova versão…" source="pt"/></p>}
          <details className="p-4 text-sm text-amber-900" open><summary><T text="Confirmações pendentes" source="pt"/></summary><ul className="list-disc pl-5">{active.pending.map(p => <li key={p}><T text={p} source="pt"/></li>)}</ul></details>
          <div className="flex flex-col xl:flex-row items-stretch">
            <ItineraryWorkspace brief={active.brief} itinerary={active.itinerary} displayBudget={`${active.brief.budget.toLocaleString()} EUR · limite, não cotação`} highlightedDay={null}
              onExportPdf={exportPdf} isExporting={exporting || saving}
              onEditBrief={() => { if (operation.current) return; setDraft(active.brief); setEditing(true); setFormKey(k => k + 1); }}
              onToggleLockActivity={(dayNumber, id) => update(t => ({ ...t, itinerary: t.itinerary.map(d => d.dayNumber === dayNumber ? { ...d, items: d.items.map(i => i.id === id ? { ...i, isLocked: !i.isLocked } : i) } : d) }))} />
            <section onKeyDown={event=>{if(event.key==="Escape" && assistantOpen){setAssistantOpen(false);assistantButton.current?.focus();}}} className="min-w-0 shrink-0 xl:absolute xl:inset-y-0 xl:right-0 xl:w-80 2xl:w-96">
              <button ref={assistantButton} type="button" aria-label={assistantLabel} title={assistantLabel}
                className="xl:hidden fixed right-4 z-40 rounded-full bg-[#143F4B] text-[#F4F0E7] border border-[#D8A65C] shadow-xl flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D8A65C]"
                style={{width:56,height:56,minHeight:56,bottom:"max(1rem, env(safe-area-inset-bottom))"}}
                aria-expanded={assistantOpen} aria-controls="curation-assistant" onClick={()=>setAssistantOpen(v=>!v)}>
                {assistantOpen ? <X aria-hidden="true" className="size-6"/> : <MessageCircle aria-hidden="true" className="size-6"/>}
              </button>
              <div id="curation-assistant" role="region" aria-label={assistantLabel}
                className={`fixed right-4 bottom-20 z-40 w-[calc(100%-2rem)] max-w-sm h-[min(70dvh,36rem)] overflow-hidden rounded-2xl border border-[#D5D1C7] shadow-xl [&>aside]:h-full xl:static xl:w-full xl:max-w-none xl:h-full xl:rounded-none xl:border-0 xl:shadow-none ${assistantOpen ? "block" : "hidden xl:block"}`}>
            <AIAssistantPanel messages={active.messages} onSendMessage={send} isProcessing={saving || exporting} onResetItinerary={() => { if (operation.current) return; setDraft(active.brief); setEditing(true); setFormKey(k => k + 1); }} />
              </div>
            </section>
          </div>
        </>}
    </main>
  </div>;
}
