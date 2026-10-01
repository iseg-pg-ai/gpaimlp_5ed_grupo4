"use client";
import { T } from "@/components/LocaleProvider";


import React from "react";
import { 
  Bed, 
  Compass, 
  UtensilsCrossed, 
  Car, 
  Sun, 
  MapPin, 
  Clock,
  Sparkles,
  Accessibility,
  AlertCircle,
  Footprints,
  Lock,
  Unlock
} from "lucide-react";
import { ActivityItem, ActivityCategory } from "@/types";
import { Badge } from "@/components/ui/badge";

interface ActivityCardProps {
  activity: ActivityItem;
  onToggleLock?: (activityId: string) => void;
}

const categoryConfig: Record<
  ActivityCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    iconColor: string;
  }
> = {
  hotel: {
    label: "Stay",
    icon: Bed,
    badgeClass: "bg-blue-50/70 text-blue-800 border-blue-200/60",
    iconColor: "text-blue-600",
  },
  activity: {
    label: "Experience",
    icon: Compass,
    badgeClass: "bg-amber-50/70 text-amber-900 border-amber-200/60",
    iconColor: "text-amber-700",
  },
  restaurant: {
    label: "Dining",
    icon: UtensilsCrossed,
    badgeClass: "bg-emerald-50/70 text-emerald-900 border-emerald-200/60",
    iconColor: "text-emerald-700",
  },
  transport: {
    label: "Transfer",
    icon: Car,
    badgeClass: "bg-purple-50/70 text-purple-900 border-purple-200/60",
    iconColor: "text-purple-700",
  },
  free_time: {
    label: "Leisure",
    icon: Sun,
    badgeClass: "bg-stone-100/80 text-stone-700 border-stone-200",
    iconColor: "text-stone-500",
  },
};

export const ActivityCard: React.FC<ActivityCardProps> = ({ 
  activity, 
  onToggleLock 
}) => {
  const config = categoryConfig[activity.category] || categoryConfig.activity;
  const Icon = config.icon;

  return (
    <div
      className={`group relative rounded-xl border p-4 transition-all duration-300 shadow-xs hover:border-[#DFD9CE] hover:shadow-sm ${
        activity.isRecentlyModified
          ? "item-highlighted border-[#E27151] ring-1 ring-[#E27151]/30 bg-white"
          : activity.isLocked
          ? "bg-[#FCFAF5] border-[#D8A65C]/60 ring-1 ring-[#D8A65C]/20"
          : "bg-white border-[#EAE6DF]"
      }`}
    >
      {/* Modification notification tag */}
      {activity.isRecentlyModified && (
        <div className="absolute -top-2.5 right-4 z-10 flex items-center gap-1 rounded-full bg-[#E27151] px-2.5 py-0.5 text-[10px] font-medium text-white shadow-xs animate-in fade-in slide-in-from-top-1">
          <Sparkles className="w-2.5 h-2.5" />
          <span><T text="Updated by Assistant" source="en"/></span>
        </div>
      )}

      {/* Locked status tag if not modified */}
      {activity.isLocked && !activity.isRecentlyModified && (
        <div className="absolute -top-2.5 right-4 z-10 flex items-center gap-1 rounded-full bg-[#143F4B] px-2 py-0.5 text-[10px] font-medium text-[#F4F0E7] shadow-xs">
          <Lock className="w-2.5 h-2.5 text-[#D8A65C]" />
          <span><T text="Pinned / Protected" source="en"/></span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start gap-3.5">
        {/* Time and category column */}
        <div className="w-full sm:w-16 shrink-0 text-left sm:text-right pt-0.5">
          <span className="font-mono text-xs font-semibold tracking-tight text-[#1A1917] block">
            <T text={activity.time} source="pt"/>
          </span>
          <div className="mt-1 flex items-center justify-end">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${config.badgeClass}`}
            >
              <Icon className="w-2.5 h-2.5 shrink-0" />
              <span><T text={config.label} source="en"/></span>
            </span>
          </div>

          {activity.duration && (
            <span className="block text-[10px] text-[#8F8B82] mt-1 font-mono">
              <T text={activity.duration} source="pt"/>
            </span>
          )}
        </div>

        {/* Vertical divider line */}
        <div className="w-px self-stretch bg-[#EAE6DF] shrink-0" />

        {/* Content body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#1A1917] leading-snug flex items-center gap-1.5">
              <span><T text={activity.title} source="pt"/></span>
              {activity.isLocked && (
                <Lock className="w-3 h-3 text-[#9E6E24] shrink-0" />
              )}
            </h4>

            <div className="flex items-center gap-1.5 shrink-0">
              {activity.effortLevel && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-[#F8F6F1] text-[#6B6861] border-[#EAE6DF]">
                  <Footprints className="w-2.5 h-2.5 text-[#8F8B82]" />
                  <span><T text="Esforço:" source="pt"/>{" "}{activity.effortLevel}</span>
                </span>
              )}

              {/* Lock/Unlock Toggle Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock?.(activity.id);
                }}
                title={activity.isLocked ? "Locked: AI will preserve this event" : "Click to lock and protect from AI changes"}
                className={`p-1 rounded-md transition-all cursor-pointer flex items-center gap-1 text-[10px] font-medium ${
                  activity.isLocked
                    ? "bg-[#FBF4E8] text-[#9E6E24] border border-[#E8D4B0] shadow-2xs"
                    : "text-[#A8A49C] hover:text-[#143F4B] hover:bg-[#F4F0E7] opacity-0 group-hover:opacity-100"
                }`}
              >
                {activity.isLocked ? (
                  <>
                    <Lock className="w-3 h-3 text-[#9E6E24]" />
                    <span className="hidden sm:inline"><T text="Locked" source="en"/></span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" />
                    <span className="hidden sm:inline"><T text="Lock" source="en"/></span>
                  </>
                )}
              </button>
            </div>
          </div>

          {activity.description && (
            <p className="mt-1 text-xs text-[#6B6861] leading-relaxed">
              <T text={activity.description} source="pt"/>
            </p>
          )}

          {activity.priceNote && <p className="mt-2 text-xs text-amber-800"><T text={activity.priceNote} source="pt"/></p>}
          {activity.source && <details className="mt-3 text-xs text-[#4A636B]">
            <summary className="cursor-pointer"><T text="Origem, decisões e confirmações pendentes" source="pt"/></summary>
            <p className="mt-2">{activity.source}</p>
            <p><T text={activity.appliedRules?.join(" · ") ?? ""} source="pt"/></p>
            <p className="text-amber-800"><T text="Por confirmar:" source="pt"/>{" "}<T text={activity.pendingChecks?.join("; ") ?? ""} source="pt"/></p>
          </details>}
          {/* Criteria metadata pills: location, accessibility, dietary notes */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            {activity.location && (
              <div className="flex items-center gap-1 text-[#8F8B82]">
                <MapPin className="w-3 h-3 text-[#B0AAA0] shrink-0" />
                <span className="truncate">{activity.location}</span>
              </div>
            )}

            {activity.accessibilityNotes && (
              <div className="inline-flex items-center gap-1 text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-200/60 text-[10px]">
                <Accessibility className="w-2.5 h-2.5 shrink-0" />
                <span><T text={activity.accessibilityNotes} source="pt"/></span>
              </div>
            )}

            {activity.dietaryNotes && (
              <div className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-200/60 text-[10px]">
                <AlertCircle className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                <span><T text={activity.dietaryNotes} source="pt"/></span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
