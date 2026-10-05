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
  Share2,
} from "lucide-react";

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
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 mb-5 border-b border-[#F0ECE4]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="teal" className="font-semibold text-sm">
                      <T text="Day" source="en" /> {day.dayNumber}
                    </Badge>
                    <span className="text-sm font-medium text-[#4A636B]">{day.date}</span>
                    <span className="text-[#C9C6BD]">·</span>
                    <span className="inline-flex items-center gap-1 text-sm text-[#4A636B]">
                      <MapPin className="w-3 h-3 text-[#A8A49C]" />
                      <span>{day.location}</span>
                    </span>
                    {day.tier && (
                      <>
                        <span className="text-[#C9C6BD]">·</span>
                        <Badge variant="outline" className="text-sm py-0">
                          {day.tier}
                        </Badge>
                      </>
                    )}
                  </div>

                  <h2 className="mt-1.5 font-serif-blu text-lg font-bold text-[#143F4B] tracking-tight">
                    <T text={day.title} source="pt" />
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onAdjustDayCapacity && (
                    <div className="flex items-center gap-1 rounded-lg border border-[#D5D1C7] bg-[#FAF8F3] px-2 py-1 text-xs text-[#143F4B]">
                      <span className="text-[#6A8288]">Capacidade:</span>
                      <button
                        type="button"
                        disabled={
                          saving ||
                          (day.dailyCapacity ??
                            (brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4)) <= 1
                        }
                        onClick={() =>
                          onAdjustDayCapacity(
                            day.dayNumber,
                            (day.dailyCapacity ??
                              (brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4)) -
                              1,
                          )
                        }
                        className="px-1 font-bold hover:bg-white rounded disabled:opacity-30"
                        title="Diminuir limite de atividades"
                      >
                        -
                      </button>
                      <span className="font-semibold px-0.5">
                        {day.items.filter((it) => it.category !== "free_time").length} /{" "}
                        {day.dailyCapacity ??
                          (brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4)}
                      </span>
                      <button
                        type="button"
                        disabled={
                          saving ||
                          (day.dailyCapacity ??
                            (brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4)) >= 6
                        }
                        onClick={() =>
                          onAdjustDayCapacity(
                            day.dayNumber,
                            (day.dailyCapacity ??
                              (brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4)) +
                              1,
                          )
                        }
                        className="px-1 font-bold hover:bg-white rounded disabled:opacity-30"
                        title="Aumentar limite de atividades deste dia"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {onAddPoiToDay && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddPoiDay(day.dayNumber)}
                      disabled={saving}
                      className="text-xs h-8 gap-1 border-[#D5D1C7] text-[#143F4B] hover:bg-[#FAF8F3]"
                      title="Adicionar oferta do catálogo a este dia"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#143F4B]" />
                      <T text="Atividade" source="pt" />
                    </Button>
                  )}

                  {onAddFreePeriodToDay && !day.items.some((it) => it.category === "free_time") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAddFreePeriodToDay(day.dayNumber, "afternoon")}
                      disabled={saving}
                      className="text-xs h-8 gap-1 border-[#D5D1C7] text-[#765218] bg-amber-50/50 hover:bg-amber-100/50"
                      title="Adicionar período de tarde livre para descanso ou compras"
                    >
                      <Sun className="w-3.5 h-3.5 text-[#D8A65C]" />
                      <T text="+ Tempo Livre" source="pt" />
                    </Button>
                  )}

                  {onOptimizeDayRoute && day.items.length > 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOptimizeDayRoute(day.dayNumber)}
                      disabled={saving}
                      className="text-xs h-8 gap-1.5 border-[#D5D1C7] text-[#143F4B] hover:bg-[#FAF8F3]"
                      title="Otimizar ordem das paragens para menor tempo de deslocação"
                    >
                      <Route className="w-3.5 h-3.5 text-[#D8A65C]" />
                      <T text="Otimizar Rota" source="pt" />
                    </Button>
                  )}
                  {isDayModified && (
                    <Badge
                      variant="gold"
                      className="gap-1.5 py-1 px-2.5 font-medium shrink-0 animate-in fade-in"
                    >
                      <Sparkles className="w-3 h-3 text-[#D8A65C]" />
                      <span>
                        <T text="Updated by Assistant" source="en" />
                      </span>
                    </Badge>
                  )}
                </div>
              </div>

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
          dayLocation={
            itinerary.find((d) => d.dayNumber === addPoiDay)?.location || brief.destination
          }
          dayCapacity={
            itinerary.find((d) => d.dayNumber === addPoiDay)?.dailyCapacity ??
            (brief.pace === "Relaxed" ? 2 : brief.pace === "Balanced" ? 3 : 4)
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
