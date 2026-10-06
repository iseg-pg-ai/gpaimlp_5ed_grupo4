"use client";

import React, { useState, useEffect, useMemo } from "react";
import { T } from "@/components/LocaleProvider";
import {
  X,
  Search,
  Plus,
  Compass,
  UtensilsCrossed,
  Sparkles,
  Clock,
  MapPin,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ActivityItem, CustomerBrief, ItineraryDay } from "@/types";

interface AddPoiModalProps {
  isOpen: boolean;
  dayNumber: number;
  dayDate?: string;
  dayLocation: string;
  dayCapacity: number;
  currentItems: ActivityItem[];
  allItineraryItems: ActivityItem[];
  brief: CustomerBrief;
  itinerary: ItineraryDay[];
  onClose: () => void;
  onAddPoi: (poiTitle: string) => Promise<boolean> | void;
  onAdjustCapacity: (newCapacity: number) => void;
}

interface CatalogEntry {
  id: string;
  category: "atracoes" | "restaurantes" | "experiencias";
  status: string;
  fields: {
    name?: string;
    location?: string;
    description?: string;
    duration?: string;
    price?: string;
    address?: string;
    effort?: string;
    hours?: string;
  };
  raw?: Record<string, unknown>;
  published?: boolean;
}

export const AddPoiModal: React.FC<AddPoiModalProps> = ({
  isOpen,
  dayNumber,
  dayDate,
  dayLocation,
  dayCapacity,
  currentItems,
  allItineraryItems,
  brief,
  itinerary,
  onClose,
  onAddPoi,
  onAdjustCapacity,
}) => {
  const [records, setRecords] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittingTitle, setSubmittingTitle] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog/eligible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, itinerary, dayNumber }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao carregar catálogo.");
        return res.json();
      })
      .then((data: CatalogEntry[]) => {
        if (!cancelled) {
          setRecords(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro desconhecido");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brief, itinerary, dayNumber]);

  const existingTitles = useMemo(() => {
    const titles = new Set<string>();
    allItineraryItems.forEach((item) => {
      titles.add(item.title.toLowerCase().trim());
    });
    return titles;
  }, [allItineraryItems]);

  const currentPoiCount = currentItems.filter((it) => it.category !== "free_time").length;
  const isAtCapacity = currentPoiCount >= dayCapacity;

  const filteredRecords = useMemo(() => {
    const query = search.toLowerCase().trim();
    const loc = dayLocation.toLowerCase().trim();

    return records.filter((rec) => {
      if (rec.status !== "approved") return false;

      if (categoryFilter !== "all" && rec.category !== categoryFilter) {
        return false;
      }

      const name = (rec.fields.name || "").toLowerCase();
      const desc = (rec.fields.description || "").toLowerCase();
      const recLoc = (rec.fields.location || "").toLowerCase();

      // If dayLocation is known, prioritize matching city or broad match
      const matchesCity = !loc || recLoc.includes(loc) || loc.includes(recLoc);

      const matchesSearch = !query || name.includes(query) || desc.includes(query);

      return matchesCity && matchesSearch;
    });
  }, [records, categoryFilter, search, dayLocation]);
  const getCompatibilityIssue = (rec: CatalogEntry) => {
    if (!brief) return null;
    const raw = (rec.raw ?? {}) as Record<string, unknown>;
    const closures = String(
      raw.dias_de_encerramento ?? raw.encerramento_base_reconfirmar ?? rec.fields.hours ?? "",
    );
    if (closures && /obras|manutencao|temporariamente encerrad/i.test(closures)) {
      return "Encerrado para obras";
    }
    const maxEffort = brief.physicalEffort.startsWith("Baixo")
      ? 0
      : brief.physicalEffort.startsWith("Moderado")
        ? 1
        : 2;
    const effortStr = String(raw.esforco_fisico ?? rec.fields.effort ?? "").toLowerCase();
    const effort = effortStr.includes("alto") ? 2 : effortStr.includes("moderado") ? 1 : 0;
    if (effort > maxEffort) {
      return `Esforço (${effort === 2 ? "Alto" : "Moderado"}) excede ${brief.physicalEffort.split(" ")[0]}`;
    }
    if (brief.mobilityRestrictions.length > 0 && effort > 0) {
      return "Incompatível com mobilidade";
    }
    return null;
  };

  const handleAddPoi = async (name: string) => {
    setSubmittingTitle(name);
    setModalError(null);
    try {
      const res = await onAddPoi(name);
      if (res !== false) {
        onClose();
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível adicionar a atividade.");
    } finally {
      setSubmittingTitle(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-[#FAF8F3] border border-[#DDD8CE] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#DDD8CE] bg-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="teal" className="text-xs font-semibold">
                Dia {dayNumber}
              </Badge>
              <span className="text-xs text-[#4A636B] flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#A8A49C]" />
                {dayLocation}
              </span>
            </div>
            <h2 className="mt-1 font-serif-blu text-xl font-bold text-[#143F4B]">
              <T text="Adicionar Atividade ao Dia" source="pt" /> {dayNumber}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#4A636B] hover:text-[#143F4B] hover:bg-[#F4F0E7] rounded-lg transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Capacity status & adjuster */}
        <div className="px-4 sm:px-5 py-3 bg-[#F4F0E7]/80 border-b border-[#E6E1D5] flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#143F4B]">
              <T text="Capacidade deste dia:" source="pt" />
            </span>
            <span className="text-[#4A636B]">
              {currentPoiCount} / {dayCapacity} <T text="atividades" source="pt" />
            </span>
            {isAtCapacity ? (
              <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">
                <AlertCircle className="w-3 h-3 text-amber-600" />
                <T text="Capacidade será aumentada automaticamente ao adicionar" source="pt" />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#2D5B67] bg-[#E7EEF0] px-2 py-0.5 rounded text-xs font-medium">
                {dayCapacity - currentPoiCount} <T text="vagas disponíveis" source="pt" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#6A8288]">
              <T text="Ajustar limite:" source="pt" />
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={dayCapacity <= 1}
              onClick={() => onAdjustCapacity(dayCapacity - 1)}
              className="h-7 w-7 p-0 text-xs font-bold"
              title="Diminuir capacidade"
            >
              -
            </Button>
            <span className="px-1.5 font-semibold text-[#143F4B]">{dayCapacity}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={dayCapacity >= 6}
              onClick={() => onAdjustCapacity(dayCapacity + 1)}
              className="h-7 w-7 p-0 text-xs font-bold"
              title="Aumentar capacidade deste dia"
            >
              +
            </Button>
          </div>
        </div>

        {/* Modal Error Banner */}
        {modalError && (
          <div className="mx-4 sm:mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">
                <T text="Não foi possível adicionar ao roteiro:" source="pt" />
              </span>
              <span>{modalError}</span>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="p-4 sm:p-5 border-b border-[#DDD8CE] bg-white space-y-3">
          <p className="text-xs text-[#4A636B]">
            <T
              text="São apresentadas apenas ofertas compatíveis com o briefing, a data, o orçamento, os horários e as regras de curadoria."
              source="pt"
            />
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A49C]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, atração, restaurante ou experiência…"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-[#D5D1C7] bg-[#FAF8F3] focus:outline-hidden focus:ring-2 focus:ring-[#143F4B]/20 text-[#143F4B]"
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                categoryFilter === "all"
                  ? "bg-[#143F4B] text-white border-[#143F4B]"
                  : "bg-white text-[#4A636B] border-[#D5D1C7] hover:bg-[#FAF8F3]"
              }`}
            >
              <T text="Todas as Categorias" source="pt" />
            </button>
            <button
              onClick={() => setCategoryFilter("atracoes")}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                categoryFilter === "atracoes"
                  ? "bg-[#143F4B] text-white border-[#143F4B]"
                  : "bg-white text-[#4A636B] border-[#D5D1C7] hover:bg-[#FAF8F3]"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <T text="Atrações" source="pt" />
            </button>
            <button
              onClick={() => setCategoryFilter("restaurantes")}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                categoryFilter === "restaurantes"
                  ? "bg-[#143F4B] text-white border-[#143F4B]"
                  : "bg-white text-[#4A636B] border-[#D5D1C7] hover:bg-[#FAF8F3]"
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <T text="Restaurantes" source="pt" />
            </button>
            <button
              onClick={() => setCategoryFilter("experiencias")}
              className={`px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                categoryFilter === "experiencias"
                  ? "bg-[#143F4B] text-white border-[#143F4B]"
                  : "bg-white text-[#4A636B] border-[#D5D1C7] hover:bg-[#FAF8F3]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <T text="Experiências" source="pt" />
            </button>
          </div>
        </div>

        {/* POI List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading ? (
            <p className="text-center py-10 text-sm text-[#4A636B]">
              <T text="A carregar ofertas do catálogo…" source="pt" />
            </p>
          ) : error ? (
            <p className="text-center py-10 text-sm text-red-700">{error}</p>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-[#4A636B]">
              <p className="text-base font-medium text-[#143F4B]">
                <T text="Nenhuma oferta encontrada" source="pt" />
              </p>
              <p className="text-xs mt-1">
                <T
                  text="Não existem outras ofertas compatíveis para este dia. Reveja o briefing, o orçamento ou a capacidade do dia."
                  source="pt"
                />
              </p>
            </div>
          ) : (
            filteredRecords.map((rec) => {
              const name = rec.fields.name || "Sem título";
              const isAlreadyAdded = existingTitles.has(name.toLowerCase().trim());
              const compatIssue = getCompatibilityIssue(rec);
              const catIcon =
                rec.category === "restaurantes" ? (
                  <UtensilsCrossed className="w-3.5 h-3.5 text-[#D8A65C]" />
                ) : rec.category === "experiencias" ? (
                  <Sparkles className="w-3.5 h-3.5 text-[#2D5B67]" />
                ) : (
                  <Compass className="w-3.5 h-3.5 text-[#4A636B]" />
                );

              const catLabel =
                rec.category === "restaurantes"
                  ? "Restaurante"
                  : rec.category === "experiencias"
                    ? "Experiência"
                    : "Atração";

              return (
                <div
                  key={rec.id}
                  className={`p-3.5 sm:p-4 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    isAlreadyAdded
                      ? "border-[#DDD8CE] opacity-60"
                      : "border-[#E2DED5] hover:border-[#143F4B]"
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#143F4B]">
                        {catIcon}
                        {catLabel}
                      </span>
                      {rec.fields.duration && (
                        <span className="text-xs text-[#6A8288] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rec.fields.duration}
                        </span>
                      )}
                      {rec.fields.price && (
                        <span className="text-xs text-[#765218] bg-amber-50/80 px-2 py-0.5 rounded">
                          {rec.fields.price}
                        </span>
                      )}
                      {compatIssue && (
                        <span
                          className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1"
                          title={compatIssue}
                        >
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          {compatIssue}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-base text-[#143F4B] truncate">{name}</h3>
                    {rec.fields.description && (
                      <p className="text-xs text-[#4A636B] line-clamp-2 leading-relaxed">
                        {rec.fields.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isAlreadyAdded ? (
                      <Badge variant="outline" className="text-xs gap-1 text-[#4A636B]">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <T text="No roteiro" source="pt" />
                      </Badge>
                    ) : (
                      <Button
                        variant="primaryDark"
                        size="sm"
                        onClick={() => {
                          onAddPoi(`${rec.category}:${rec.id}`);
                          onClose();
                        }}
                        className="text-xs h-8 gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <T text="Adicionar ao Dia" source="pt" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-[#DDD8CE] bg-white flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            <T text="Fechar" source="pt" />
          </Button>
        </div>
      </div>
    </div>
  );
};
