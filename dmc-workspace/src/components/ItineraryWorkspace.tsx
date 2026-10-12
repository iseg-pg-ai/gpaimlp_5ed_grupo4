"use client";
import { T, useLocale, useTranslated } from "@/components/LocaleProvider";

import type { ActivityConfirmation } from "@/lib/activity-confirmation";
import React, { useState, useRef, useEffect } from "react";
import { ItineraryDay, CustomerBrief, TransitLeg, TransitMode } from "@/types";
import { ProposalStatus } from "./ProposalStatus";
import { ActivityCard } from "./ActivityCard";
import { TransitConnector } from "./TransitConnector";
import { TransitInspectorModal } from "./TransitInspectorModal";
import { AddPoiModal } from "./AddPoiModal";
import { DayWeatherBadge } from "./DayWeatherBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Users,
  MapPin,
  Download,
  SlidersHorizontal,
  Sparkles,
  Route,
  Plus,
  Sun,
  Clock,
  Check,
  Share2,
  MoreHorizontal,
} from "lucide-react";

function getTripPaceConfig(brief: CustomerBrief) {
  if (brief.personalization?.extraBreaks) {
    return { defaultCapacity: 2, label: "Pausas Extras", maxLabel: "máx. 2" };
  }
  switch (brief.pace) {
    case "Relaxed":
      return { defaultCapacity: 2, label: "Relaxado", maxLabel: "máx. 2" };
    case "Balanced":
      return { defaultCapacity: 3, label: "Equilibrado", maxLabel: "máx. 3" };
    case "Active":
      return { defaultCapacity: 4, label: "Ativo", maxLabel: "máx. 4" };
    default:
      return { defaultCapacity: 2, label: "Padrão", maxLabel: "máx. 2" };
  }
}

// ---------------------------------------------------------------------------
// DayCardHeader — compact, clean day-level header
// ---------------------------------------------------------------------------
interface DayCardHeaderProps {
  day: ItineraryDay;
  isDayModified?: boolean;
  paceConfig: { defaultCapacity: number; label: string; maxLabel: string };
  effectiveCapacity: number;
  poiCount: number;
  isCustom: boolean;
  isFull: boolean;
  availableSlots: number;
  saving?: boolean;
  onAdjustDayCapacity?: (dayNumber: number, newCapacity: number) => void;
  onAddPoiToDay?: () => void;
  onAddFreePeriodToDay?: () => void;
  onOptimizeDayRoute?: () => void;
}

function DayCardHeader({
  day,
  isDayModified,
  paceConfig,
  effectiveCapacity,
  poiCount,
  isCustom,
  isFull,
  availableSlots,
  saving,
  onAdjustDayCapacity,
  onAddPoiToDay,
  onAddFreePeriodToDay,
  onOptimizeDayRoute,
}: DayCardHeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close kebab menu on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const hasActions = onAddPoiToDay || onAddFreePeriodToDay || onOptimizeDayRoute;

  return (
    <div className="pb-4 mb-5 border-b border-[#F0ECE4]">
      {/* Single horizontal row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* ── LEFT: contextual info ───────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="teal" className="font-semibold text-sm shrink-0">
            <T text="Day" source="en" /> {day.dayNumber}
          </Badge>
          <span className="text-sm text-[#4A636B]">{day.date}</span>
          <span className="text-[#C9C6BD] select-none">·</span>
          <span className="inline-flex items-center gap-1 text-sm text-[#4A636B]">
            <MapPin className="w-3 h-3 text-[#A8A49C] shrink-0" />
            <span>{day.location}</span>
          </span>
          <DayWeatherBadge date={day.date} location={day.location} items={day.items} />
          {day.tier && (
            <Badge variant="outline" className="text-xs py-0">
              {day.tier}
            </Badge>
          )}
          {isDayModified && (
            <Badge
              variant="gold"
              className="gap-1 py-0.5 px-2 font-medium animate-in fade-in shrink-0"
            >
              <Sparkles className="w-3 h-3 text-[#D8A65C]" />
              <span>
                <T text="Updated" source="en" />
              </span>
            </Badge>
          )}
        </div>

        {/* ── RIGHT: capacity + actions ───────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Capacity counter — always visible when adjustable */}
          {onAdjustDayCapacity ? (
            <div
              className={`flex items-center rounded-lg border px-1.5 py-0.5 text-xs shadow-2xs ${
                isCustom
                  ? "border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]"
                  : "border-[#D5D1C7] bg-white text-[#143F4B]"
              }`}
              title={
                isCustom
                  ? `Capacidade personalizada (${effectiveCapacity}/dia). Ritmo base: ${paceConfig.label} (${paceConfig.defaultCapacity}/dia).`
                  : `Ritmo: ${paceConfig.label} — ${paceConfig.maxLabel} atividades/dia`
              }
            >
              {isCustom && <Sparkles className="w-3 h-3 text-[#EA580C] mr-1 shrink-0" />}
              <button
                type="button"
                disabled={saving || effectiveCapacity <= 1}
                onClick={() => onAdjustDayCapacity(day.dayNumber, effectiveCapacity - 1)}
                className="w-5 h-5 flex items-center justify-center font-bold hover:bg-black/5 rounded text-current disabled:opacity-30 cursor-pointer transition-colors"
                aria-label="Diminuir limite de atividades"
              >
                −
              </button>
              <span
                className={`font-semibold px-1 tabular-nums ${isFull ? "text-emerald-700" : ""}`}
              >
                {poiCount}/{effectiveCapacity}
              </span>
              <button
                type="button"
                disabled={saving || effectiveCapacity >= 6}
                onClick={() => onAdjustDayCapacity(day.dayNumber, effectiveCapacity + 1)}
                className="w-5 h-5 flex items-center justify-center font-bold hover:bg-black/5 rounded text-current disabled:opacity-30 cursor-pointer transition-colors"
                aria-label="Aumentar limite de atividades"
              >
                +
              </button>
              {isCustom && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onAdjustDayCapacity(day.dayNumber, paceConfig.defaultCapacity)}
                  className="ml-1 text-[#C2410C] hover:text-[#7C2D12] text-[10px] underline cursor-pointer leading-none"
                  title={`Repor ritmo base (${paceConfig.defaultCapacity}/dia)`}
                >
                  repor
                </button>
              )}
            </div>
          ) : null}

          {/* Status chip */}
          {isFull ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-md font-medium">
              <Check className="w-3 h-3 text-emerald-600" />
              <T text="Completo" source="pt" />
            </span>
          ) : availableSlots > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#2D5B67] bg-[#E7EEF0] px-2 py-1 rounded-md font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2D5B67] animate-pulse shrink-0" />
              {availableSlots} {availableSlots === 1 ? "vaga" : "vagas"}
            </span>
          ) : null}

          {/* ⋯ kebab — action buttons */}
          {hasActions && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#D5D1C7] bg-white text-[#4A636B] hover:bg-[#FAF8F3] hover:border-[#2D5B67] hover:text-[#143F4B] transition-colors"
                title="Mais ações para este dia"
                aria-label="Ações do dia"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[220px] rounded-xl border border-[#E6E1D5] bg-white shadow-lg py-1.5 animate-in fade-in slide-in-from-top-1">
                  {/* Pace info */}
                  <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] text-[#6A8288] border-b border-[#F0ECE4] mb-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>
                      <T text={`Ritmo: ${paceConfig.label}`} source="pt" />
                    </span>
                  </div>

                  {onAddPoiToDay && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        onAddPoiToDay();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#143F4B] hover:bg-[#F5F3EE] transition-colors disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#2D5B67] shrink-0" />
                      <T text="Adicionar Atividade" source="pt" />
                    </button>
                  )}

                  {onAddFreePeriodToDay && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        onAddFreePeriodToDay();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#765218] hover:bg-amber-50 transition-colors disabled:opacity-40"
                    >
                      <Sun className="w-3.5 h-3.5 text-[#D8A65C] shrink-0" />
                      <T text="Adicionar Tempo Livre" source="pt" />
                    </button>
                  )}

                  {onOptimizeDayRoute && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        onOptimizeDayRoute();
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#143F4B] hover:bg-[#F5F3EE] transition-colors disabled:opacity-40"
                    >
                      <Route className="w-3.5 h-3.5 text-[#D8A65C] shrink-0" />
                      <T text="Otimizar Rota" source="pt" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Day title — second row */}
      <h2 className="mt-1.5 font-serif-blu text-lg font-bold text-[#143F4B] tracking-tight">
        <T text={day.title} source="pt" />
      </h2>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ItineraryWorkspaceProps {
  brief: CustomerBrief;
  itinerary: ItineraryDay[];
  highlightedDay: number | null;
  onEditBrief: () => void;
  onExportPdf: () => void;
  onShare?: () => void;
  isExporting?: boolean;
  displayBudget: string;
  proposalTools?: React.ReactNode;
  version?: number;
  exported?: boolean;
  onConfirmActivity?: (
    dayNumber: number,
    activityId: string,
    value: ActivityConfirmation,
  ) => Promise<boolean>;
  saving?: boolean;
  onToggleLockActivity?: (dayNumber: number, activityId: string) => void;
  onOptimizeDayRoute?: (dayNumber: number) => void;
  onUpdateTransitLeg?: (
    dayNumber: number,
    activityId: string,
    newMode: TransitMode,
    bufferMinutes?: number,
  ) => void;
  onAddPoiToDay?: (dayNumber: number, title: string) => void;
  onRemoveActivity?: (dayNumber: number, activityId: string) => void;
  onAddFreePeriodToDay?: (dayNumber: number, type: "afternoon" | "morning" | "fullday") => void;
  onAdjustDayCapacity?: (dayNumber: number, newCapacity: number) => void;
}

export const ItineraryWorkspace: React.FC<ItineraryWorkspaceProps> = ({
  brief,
  itinerary,
  highlightedDay,
  onEditBrief,
  onExportPdf,
  onShare,
  isExporting,
  displayBudget,
  proposalTools,
  version,
  exported,
  onToggleLockActivity,
  onConfirmActivity,
  onOptimizeDayRoute,
  onUpdateTransitLeg,
  onAddPoiToDay,
  onRemoveActivity,
  onAddFreePeriodToDay,
  onAdjustDayCapacity,
  saving,
}) => {
  const { locale } = useLocale();
  const dayNavigationLabel = useTranslated("Navegação por dias", "pt");
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date + "T12:00:00"));
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "all">("all");
  const [inspectedLegInfo, setInspectedLegInfo] = useState<{
    leg: TransitLeg;
    dayNumber: number;
    activityId: string;
  } | null>(null);
  const [addPoiDay, setAddPoiDay] = useState<number | null>(null);
  const dayRefs = useRef<{ [key: number]: HTMLElement | null }>({});

  // Auto-scroll into view when a specific day is modified by the AI Assistant
  useEffect(() => {
    if (highlightedDay !== null && dayRefs.current[highlightedDay]) {
      dayRefs.current[highlightedDay]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlightedDay]);

  const filteredDays =
    selectedDayFilter === "all"
      ? itinerary
      : itinerary.filter((d) => d.dayNumber === selectedDayFilter);

  return (
    <div className="flex-1 min-w-0 w-full bg-[#F4F0E7] pb-24">
      <header className="px-4 sm:px-6 py-7 border-b border-[#DDD8CE]">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <ProposalStatus state="draft" />
            {exported && <ProposalStatus state="exported" />}
            {version && (
              <span className="text-sm text-[#4A636B]">v{String(version).padStart(3, "0")}</span>
            )}
          </div>
          <p className="text-base font-medium text-[#4A636B] break-words">{brief.customerName}</p>
          <h1 className="mt-2 font-serif-blu text-3xl sm:text-4xl leading-tight text-[#143F4B] break-words">
            {brief.destination}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm sm:text-base text-[#143F4B]">
            <p className="flex flex-wrap items-center gap-2">
              <Calendar aria-hidden="true" className="size-4 shrink-0" />
              {formatDate(brief.startDate)} — {formatDate(brief.endDate)}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <Users aria-hidden="true" className="size-4" />
              {brief.adults + brief.children} <T text="travellers" />
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              variant="primaryDark"
              onClick={onExportPdf}
              disabled={isExporting}
              className="min-h-11 text-sm"
            >
              <Download aria-hidden="true" className="size-4" />
              <T text={isExporting ? "A exportar…" : "Exportar PDF"} source="pt" />
            </Button>
            <Button variant="outline" onClick={onEditBrief} className="min-h-11 text-sm">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              <T text="Edit Brief" />
            </Button>
            {onShare && version && (
              <Button variant="outline" onClick={onShare} className="min-h-11 text-sm">
                <Share2 aria-hidden="true" className="size-4" />
                <T text="Partilhar" source="pt" />
              </Button>
            )}
          </div>
          <p className="mt-4 text-sm leading-6 text-[#4A636B]">
            <T
              text="Proposta preliminar. Exportar não confirma reservas, disponibilidade ou preços."
              source="pt"
            />
          </p>
          <details
            data-testid="proposal-preferences"
            className="mt-5 rounded-xl border border-[#DDD8CE] bg-[#FFFEFA] px-4 py-3 text-sm"
          >
            <summary className="cursor-pointer font-medium text-[#143F4B]">
              <T text="Preferências e restrições da viagem" source="pt" />
            </summary>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[#4A636B] leading-6">
              <div>
                <dt className="font-semibold text-[#143F4B]">
                  <T text="Nível da proposta" source="pt" />
                </dt>
                <dd>{brief.proposalTier}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#143F4B]">
                  <T text="Esforço:" source="pt" />
                </dt>
                <dd>
                  <T text={brief.physicalEffort} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#143F4B]">
                  <T text="Orçamento indicado" source="pt" />
                </dt>
                <dd>
                  <T text={displayBudget} source="pt" />
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#143F4B]">
                  <T text="Ritmo e horários" source="pt" />
                </dt>
                <dd>
                  <T text={brief.pace} /> · <T text={brief.morningPreference} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#143F4B]">
                  <T text="Mobilidade" source="pt" />
                </dt>
                <dd>
                  {brief.mobilityRestrictions.length ? (
                    brief.mobilityRestrictions.map((value) => (
                      <p key={value}>
                        <T text={value} />
                      </p>
                    ))
                  ) : (
                    <T text="Não indicada" source="pt" />
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#143F4B]">
                  <T text="Restrições alimentares" source="pt" />
                </dt>
                <dd>
                  {brief.dietaryRestrictions.length ? (
                    brief.dietaryRestrictions.map((value) => (
                      <p key={value}>
                        <T text={value} />
                      </p>
                    ))
                  ) : (
                    <T text="Não indicadas" source="pt" />
                  )}
                </dd>
              </div>
              {brief.exclusions.length > 0 && (
                <div>
                  <dt className="font-semibold text-[#143F4B]">
                    <T text="Exclusões" source="pt" />
                  </dt>
                  <dd>
                    {brief.exclusions.map((value) => (
                      <p key={value}>
                        <T text={value} />
                      </p>
                    ))}
                  </dd>
                </div>
              )}
              {brief.specialOccasion && (
                <div>
                  <dt className="font-semibold text-[#143F4B]">
                    <T text="Ocasião especial" source="pt" />
                  </dt>
                  <dd>{brief.specialOccasion}</dd>
                </div>
              )}
            </dl>
          </details>
          {proposalTools && (
            <details
              data-testid="proposal-tools"
              className="mt-3 rounded-xl border border-[#DDD8CE] bg-[#FFFEFA] text-sm"
            >
              <summary className="cursor-pointer px-4 py-3 font-medium text-[#143F4B]">
                <T text="Exportação, versões e confirmações" source="pt" />
              </summary>
              {proposalTools}
            </details>
          )}
        </div>
      </header>
      <nav
        aria-label={dayNavigationLabel}
        data-testid="day-navigation"
        className="sticky top-0 z-20 border-b border-[#D5D1C7] bg-[#F4F0E7]/95 backdrop-blur-sm px-4 sm:px-6 py-3"
      >
        <div className="max-w-4xl mx-auto flex gap-2 overflow-x-auto pb-1">
          <Button
            aria-pressed={selectedDayFilter === "all"}
            variant={selectedDayFilter === "all" ? "primaryDark" : "outline"}
            onClick={() => setSelectedDayFilter("all")}
            className="shrink-0 min-h-11 text-sm"
          >
            <T text="Todos os dias" source="pt" /> ({itinerary.length})
          </Button>
          {itinerary.map((day) => (
            <Button
              key={day.dayNumber}
              aria-pressed={selectedDayFilter === day.dayNumber}
              variant={selectedDayFilter === day.dayNumber ? "primaryDark" : "outline"}
              onClick={() => setSelectedDayFilter(day.dayNumber)}
              className="shrink-0 min-h-11 text-sm flex-col gap-0.5 px-4"
            >
              <span>
                <T text="Day" /> {day.dayNumber}
              </span>
              <span className="text-xs opacity-90">{formatDate(day.date)}</span>
            </Button>
          ))}
        </div>
      </nav>

      {/* Main Itinerary Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-5 sm:pt-8 space-y-8">
        {filteredDays.map((day) => {
          const isDayModified = highlightedDay === day.dayNumber || day.isRecentlyModified;
          const paceConfig = getTripPaceConfig(brief);
          const effectiveCapacity = day.dailyCapacity ?? paceConfig.defaultCapacity;
          const poiCount = day.items.filter((it) => it.category !== "free_time").length;
          const isCustom =
            typeof day.dailyCapacity === "number" &&
            day.dailyCapacity !== paceConfig.defaultCapacity;
          const isFull = poiCount >= effectiveCapacity;
          const availableSlots = Math.max(0, effectiveCapacity - poiCount);
          return (
            <section
              key={day.dayNumber}
              ref={(el) => {
                dayRefs.current[day.dayNumber] = el;
              }}
              className={`scroll-mt-24 rounded-2xl border p-4 sm:p-6 transition-all duration-300 relative ${
                isDayModified
                  ? "bg-[#FFFDF9] border-[#D8A65C] shadow-sm ring-1 ring-[#D8A65C]/30"
                  : "bg-white border-[#D5D1C7] shadow-2xs"
              }`}
            >
              {/* Day Header */}
              <DayCardHeader
                day={day}
                isDayModified={isDayModified}
                paceConfig={paceConfig}
                effectiveCapacity={effectiveCapacity}
                poiCount={poiCount}
                isCustom={isCustom}
                isFull={isFull}
                availableSlots={availableSlots}
                saving={saving}
                onAdjustDayCapacity={onAdjustDayCapacity}
                onAddPoiToDay={onAddPoiToDay ? () => setAddPoiDay(day.dayNumber) : undefined}
                onAddFreePeriodToDay={
                  onAddFreePeriodToDay && !day.items.some((it) => it.category === "free_time")
                    ? () => onAddFreePeriodToDay(day.dayNumber, "afternoon")
                    : undefined
                }
                onOptimizeDayRoute={
                  onOptimizeDayRoute && day.items.length > 2
                    ? () => onOptimizeDayRoute(day.dayNumber)
                    : undefined
                }
              />

              {day.summary && (
                <p className="text-sm leading-7 text-[#4A636B] mb-4">
                  &quot;
                  <T text={day.summary} source="pt" />
                  &quot;
                </p>
              )}

              {day.routeSummary && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#E6E1D5] bg-[#FAF8F3] px-3.5 py-2.5 text-xs text-[#2D5B67]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#143F4B] flex items-center gap-1.5">
                      <Route className="w-3.5 h-3.5 text-[#D8A65C]" />
                      <T text="Resumo da Rota:" source="pt" />
                    </span>
                    <span>
                      🚗 {day.routeSummary.totalTransitTime} · {day.routeSummary.totalDistance} (
                      {day.routeSummary.legsCount}{" "}
                      {day.routeSummary.legsCount === 1 ? "deslocação" : "deslocações"})
                    </span>
                    {day.routeSummary.walkingDistance &&
                      day.routeSummary.walkingDistance !== "0 m" && (
                        <span className="text-[#698288]">
                          · 🚶 {day.routeSummary.walkingDistance} a pé
                        </span>
                      )}
                  </div>
                  <Badge variant="teal" className="text-[10px] py-0 px-2 font-normal">
                    <T
                      text={
                        day.routeSummary.algorithmStatus === "Feasible & Optimized"
                          ? "Viável e Otimizado"
                          : day.routeSummary.algorithmStatus === "Buffer Added"
                            ? "Margem Adicionada"
                            : day.routeSummary.algorithmStatus === "Manual Adjusted"
                              ? "Ajustado Manualmente"
                              : day.routeSummary.algorithmStatus
                      }
                      source="pt"
                    />
                  </Badge>
                </div>
              )}

              {/* Activities timeline with Stippl-inspired transit & dislocation cards */}
              <div className="space-y-4">
                {day.items.map((activity) => {
                  return (
                    <React.Fragment key={activity.id}>
                      <ActivityCard
                        activity={activity}
                        saving={saving}
                        onConfirm={
                          onConfirmActivity
                            ? (value) => onConfirmActivity(day.dayNumber, activity.id, value)
                            : undefined
                        }
                        onToggleLock={() => onToggleLockActivity?.(day.dayNumber, activity.id)}
                        onRemove={
                          onRemoveActivity
                            ? () => onRemoveActivity(day.dayNumber, activity.id)
                            : undefined
                        }
                      />
                      {activity.transitToNext && (
                        <TransitConnector
                          leg={activity.transitToNext}
                          onInspect={(leg) =>
                            setInspectedLegInfo({
                              leg,
                              dayNumber: day.dayNumber,
                              activityId: activity.id,
                            })
                          }
                        />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Available Slot Card based on Trip Rhythm */}
                {availableSlots > 0 && onAddPoiToDay && (
                  <button
                    type="button"
                    onClick={() => setAddPoiDay(day.dayNumber)}
                    disabled={saving}
                    className="group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D5D1C7] bg-[#FAF8F3]/50 p-4 text-xs font-medium text-[#2D5B67] hover:border-[#2D5B67] hover:bg-[#FAF8F3] transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#2D5B67] transition-transform group-hover:scale-110" />
                    <span>
                      <T
                        text={`Vaga disponível (${poiCount + 1}/${effectiveCapacity}) de acordo com o ritmo — clique para adicionar atividade`}
                        source="pt"
                      />
                    </span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Transit Routing Inspector Modal */}
      <TransitInspectorModal
        leg={inspectedLegInfo?.leg ?? null}
        onClose={() => setInspectedLegInfo(null)}
        onApplyMode={
          onUpdateTransitLeg && inspectedLegInfo
            ? (newMode, newBuffer) => {
                onUpdateTransitLeg(
                  inspectedLegInfo.dayNumber,
                  inspectedLegInfo.activityId,
                  newMode,
                  newBuffer,
                );
                setInspectedLegInfo(null);
              }
            : undefined
        }
      />

      {/* Add POI Modal */}
      {addPoiDay !== null && (
        <AddPoiModal
          isOpen={true}
          dayNumber={addPoiDay}
          dayDate={itinerary.find((d) => d.dayNumber === addPoiDay)?.date}
          dayLocation={
            itinerary.find((d) => d.dayNumber === addPoiDay)?.location || brief.destination
          }
          dayCapacity={
            itinerary.find((d) => d.dayNumber === addPoiDay)?.dailyCapacity ??
            getTripPaceConfig(brief).defaultCapacity
          }
          currentItems={itinerary.find((d) => d.dayNumber === addPoiDay)?.items || []}
          allItineraryItems={itinerary.flatMap((d) => d.items)}
          brief={brief}
          itinerary={itinerary}
          onClose={() => setAddPoiDay(null)}
          onAddPoi={(title) => onAddPoiToDay?.(addPoiDay, title)}
          onAdjustCapacity={(cap) => onAdjustDayCapacity?.(addPoiDay, cap)}
        />
      )}
    </div>
  );
};
