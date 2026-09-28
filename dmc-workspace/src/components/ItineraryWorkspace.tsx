"use client";
import { T } from "@/components/LocaleProvider";


import React, { useState, useRef, useEffect } from "react";
import { ItineraryDay, CustomerBrief, TransitLeg } from "@/types";
import { ActivityCard } from "./ActivityCard";
import { TransitConnector } from "./TransitConnector";
import { TransitInspectorModal } from "./TransitInspectorModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Users, 
  Coins, 
  Compass, 
  MapPin, 
  ArrowRight, 
  Share2, 
  Download, 
  SlidersHorizontal,
  Sparkles,
  Accessibility,
  AlertCircle,
  Footprints,
  Crown,
  Clock,
  Navigation,
  Route,
  ShieldCheck
} from "lucide-react";

interface ItineraryWorkspaceProps {
  brief: CustomerBrief;
  itinerary: ItineraryDay[];
  highlightedDay: number | null;
  onEditBrief: () => void;
  onExportPdf: () => void;
  isExporting?: boolean;
  displayBudget: string;
  onToggleLockActivity?: (dayNumber: number, activityId: string) => void;
}

export const ItineraryWorkspace: React.FC<ItineraryWorkspaceProps> = ({
  brief,
  itinerary,
  highlightedDay,
  onEditBrief,
  onExportPdf,
  isExporting,
  displayBudget,
  onToggleLockActivity,
}) => {
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "all">("all");
  const [inspectedLeg, setInspectedLeg] = useState<TransitLeg | null>(null);
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

  const filteredDays = selectedDayFilter === "all" 
    ? itinerary 
    : itinerary.filter((d) => d.dayNumber === selectedDayFilter);

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#F4F0E7] pb-24">
      {/* Top sticky summary header */}
      <header className="sticky top-0 z-20 border-b border-[#D5D1C7] bg-[#F4F0E7]/95 backdrop-blur-xs px-8 py-5">
        <div className="max-w-4xl mx-auto">
          {/* Title and Top Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="gold" className="font-semibold uppercase tracking-wider text-[10px] gap-1">
                  <Crown className="w-2.5 h-2.5 text-[#D8A65C]" />
                  <span>{brief.proposalTier}<T text="Tier Curation" source="en"/></span>
                </Badge>
                <span className="text-[#698288] text-xs font-normal"><T text="• Rascunho para revisão" source="pt"/></span>
                {brief.specialOccasion && (
                  <>
                    <span className="text-[#C9C6BD]">·</span>
                    <span className="text-xs text-[#2D5B67] font-medium">{brief.specialOccasion}</span>
                  </>
                )}
              </div>
              <h1 className="font-serif-blu text-2xl font-bold tracking-tight text-[#143F4B]">
                {brief.customerName} — {brief.destination}
              </h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-[#4A636B]">
                <span className="font-medium text-[#143F4B]">
                  {brief.startDate.slice(5)} – {brief.endDate.slice(5)}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <span>{Array.from(new Set(itinerary.map(day => day.location))).join(" → ")}</span>
                </span>
              </div>
            </div>

            {/* Quick action buttons with Shadcn Button */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={onEditBrief}
                className="gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#698288]" />
                <span><T text="Edit Brief" source="en"/></span>
              </Button>
              <Button 
                variant="outline"
                size="sm"
                disabled title="Partilha ainda não disponível"
                className="gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5 text-[#698288]" />
                <span><T text="Share" source="en"/></span>
              </Button>
              <Button 
                variant="primaryDark"
                size="sm"
                onClick={onExportPdf} disabled={isExporting}
                className="gap-1.5 bg-[#143F4B] hover:bg-[#0A242B]"
              >
                <Download className="w-3.5 h-3.5 text-white/80" />
                <span><T text={isExporting ? "A exportar…" : "Exportar PDF"} source="pt"/></span>
              </Button>
            </div>
          </div>

          {/* Enriched Metadata Chips from BLU Pipeline */}
          <div className="mt-4 pt-3 border-t border-[#E2DDD3] flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="px-2.5 py-1 gap-1.5 font-medium">
              <Calendar className="w-3.5 h-3.5 text-[#698288]" />
              <span>{itinerary.length}<T text="dias ·" source="pt"/>{" "}{Math.max(0, itinerary.length - 1)}<T text="noites" source="pt"/></span>
            </Badge>

            <Badge variant="secondary" className="px-2.5 py-1 gap-1.5 font-medium">
              <Users className="w-3.5 h-3.5 text-[#698288]" />
              <span>{brief.adults + brief.children}<T text="travellers" source="en"/></span>
            </Badge>

            <Badge variant="secondary" className="px-2.5 py-1 gap-1.5 font-medium">
              <Coins className="w-3.5 h-3.5 text-[#698288]" />
              <span><T text={displayBudget} source="pt"/></span>
            </Badge>

            {/* Physical Effort constraint pill */}
            <Badge variant="secondary" className="px-2.5 py-1 gap-1.5 font-medium text-[#143F4B]">
              <Footprints className="w-3.5 h-3.5 text-[#698288]" />
              <span><T text="Esforço:" source="pt"/>{" "}<T text={brief.physicalEffort}/></span>
            </Badge>

            {/* Morning start pace pill */}
            <Badge variant="secondary" className="px-2.5 py-1 gap-1.5 font-medium text-[#143F4B]">
              <Clock className="w-3.5 h-3.5 text-[#698288]" />
              <span><T text={brief.morningPreference}/></span>
            </Badge>

            {/* Mobility restriction badge */}
            {brief.mobilityRestrictions.length > 0 && (
              <Badge variant="teal" className="px-2.5 py-1 gap-1.5 font-medium">
                <Accessibility className="w-3.5 h-3.5 text-[#2D5B67]" />
                <span><T text={brief.mobilityRestrictions[0]} source="en"/></span>
              </Badge>
            )}

            {/* Dietary allergy safety badge */}
            {brief.dietaryRestrictions.length > 0 && (
              <Badge variant="gold" className="px-2.5 py-1 gap-1.5 font-medium">
                <AlertCircle className="w-2.5 h-2.5 text-[#9E6E24]" />
                <span><T text={brief.dietaryRestrictions[0]} source="en"/></span>
              </Badge>
            )}
          </div>

          {/* Quick Day Navigator */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            <Button
              variant={selectedDayFilter === "all" ? "primaryDark" : "outline"}
              size="sm"
              onClick={() => setSelectedDayFilter("all")}
              className="h-7 text-xs font-medium"
            ><T text="All Days (" source="en"/>{itinerary.length})
            </Button>
            {itinerary.map((day) => (
              <Button
                key={day.dayNumber}
                variant={
                  selectedDayFilter === day.dayNumber
                    ? "primaryDark"
                    : highlightedDay === day.dayNumber
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() => {
                  setSelectedDayFilter(day.dayNumber);
                  dayRefs.current[day.dayNumber]?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`h-7 text-xs font-medium flex items-center gap-1 ${
                  highlightedDay === day.dayNumber && selectedDayFilter !== day.dayNumber
                    ? "bg-[#FBF4E8] text-[#9E6E24] border-[#D8A65C]/60 font-semibold"
                    : ""
                }`}
              >
                <span><T text="Day" source="en"/>{" "}{day.dayNumber}</span>
                {highlightedDay === day.dayNumber && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D8A65C]" />
                )}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Itinerary Content */}
      <main className="max-w-4xl mx-auto px-8 pt-8 space-y-8">
        {filteredDays.map((day) => {
          const isDayModified = highlightedDay === day.dayNumber || day.isRecentlyModified;
          return (
            <section
              key={day.dayNumber}
              ref={(el) => {
                dayRefs.current[day.dayNumber] = el;
              }}
              className={`rounded-2xl border p-6 transition-all duration-300 relative ${
                isDayModified
                  ? "bg-[#FFFDF9] border-[#D8A65C] shadow-sm ring-1 ring-[#D8A65C]/30"
                  : "bg-white border-[#D5D1C7] shadow-2xs"
              }`}
            >
              {/* Day Header */}
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 mb-5 border-b border-[#F0ECE4]">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="teal" className="font-bold text-[10px] tracking-wide uppercase"><T text="Day" source="en"/>{" "}{day.dayNumber}
                    </Badge>
                    <span className="text-xs font-medium text-[#698288]">
                      {day.date}
                    </span>
                    <span className="text-[#C9C6BD]">·</span>
                    <span className="inline-flex items-center gap-1 text-xs text-[#4A636B]">
                      <MapPin className="w-3 h-3 text-[#A8A49C]" />
                      <span>{day.location}</span>
                    </span>
                    {day.tier && (
                      <>
                        <span className="text-[#C9C6BD]">·</span>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {day.tier}
                        </Badge>
                      </>
                    )}
                  </div>

                  <h2 className="mt-1.5 font-serif-blu text-lg font-bold text-[#143F4B] tracking-tight">
                    <T text={day.title} source="pt"/>
                  </h2>
                </div>

                {isDayModified && (
                  <Badge variant="gold" className="gap-1.5 py-1 px-2.5 font-medium shrink-0 animate-in fade-in">
                    <Sparkles className="w-3 h-3 text-[#D8A65C]" />
                    <span><T text="Curated by Assistant (Rule Verified)" source="en"/></span>
                  </Badge>
                )}
              </div>

              {day.summary && (
                <p className="text-xs text-[#4A636B] -mt-2 mb-5 italic font-serif-blu">
                  "<T text={day.summary} source="pt"/>"
                </p>
              )}

              {/* Activities timeline with Stippl-inspired transit & dislocation cards */}
              <div className="space-y-1">
                {day.items.map((activity) => {
                  // Transfers are rendered as sleek dislocation cards, not big activity cards
                  if (activity.category === "transport") {
                    const leg: TransitLeg = activity.transitToNext || {
                      id: `tr-${activity.id}`,
                      fromLocation: activity.location || "Origin",
                      toLocation: "Destination",
                      mode: "chauffeur",
                      duration: activity.duration || "25 min",
                      routeNote: activity.description,
                      bufferMinutes: 15,
                      isAlgorithmOptimized: true,
                      algorithmNote: "Chauffeured door-to-door transfer (Rule R15)",
                    };

                    return (
                      <div key={activity.id} className="py-1">
                        <TransitConnector 
                          leg={leg} 
                          time={activity.time}
                          title={activity.title}
                          onInspect={(l) => setInspectedLeg(l)}
                        />
                      </div>
                    );
                  }

                  return (
                    <React.Fragment key={activity.id}>
                      <ActivityCard 
                        activity={activity} 
                        onToggleLock={() => onToggleLockActivity?.(day.dayNumber, activity.id)}
                      />
                      {activity.transitToNext && (
                        <TransitConnector 
                          leg={activity.transitToNext} 
                          onInspect={(leg) => setInspectedLeg(leg)}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      {/* Transit Routing Inspector Modal */}
      <TransitInspectorModal 
        leg={inspectedLeg} 
        onClose={() => setInspectedLeg(null)} 
      />
    </div>
  );
};
