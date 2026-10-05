"use client";
import { T } from "@/components/LocaleProvider";

import React from "react";
import { Car, Footprints, Ship, Train, ShieldCheck, Info, Clock } from "lucide-react";
import { TransitLeg, TransitMode } from "@/types";
import { Badge } from "@/components/ui/badge";

interface TransitConnectorProps {
  leg: TransitLeg;
  time?: string;
  title?: string;
  onInspect?: (leg: TransitLeg) => void;
}

const modeConfig: Record<
  TransitMode,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    bgPill: string;
  }
> = {
  chauffeur: {
    label: "Private Chauffeur",
    icon: Car,
    accentColor: "text-[#143F4B]",
    bgPill: "bg-[#F4F0E7] text-[#143F4B] border-[#D5D1C7]",
  },
  walk: {
    label: "Curated Flat Walk",
    icon: Footprints,
    accentColor: "text-[#2D5B67]",
    bgPill: "bg-[#EAF0F1] text-[#2D5B67] border-[#BCD0D4]",
  },
  boat: {
    label: "Scenic Boat / Rabelo",
    icon: Ship,
    accentColor: "text-[#1A5C70]",
    bgPill: "bg-[#E5F3F7] text-[#1A5C70] border-[#A8D3E0]",
  },
  train: {
    label: "Scenic Rail",
    icon: Train,
    accentColor: "text-[#9E6E24]",
    bgPill: "bg-[#FBF4E8] text-[#9E6E24] border-[#E8D4B0]",
  },
  funicular: {
    label: "Historic Funicular",
    icon: Train,
    accentColor: "text-[#9E6E24]",
    bgPill: "bg-[#FBF4E8] text-[#9E6E24] border-[#E8D4B0]",
  },
};

export const TransitConnector: React.FC<TransitConnectorProps> = ({
  leg,
  time,
  title,
  onInspect,
}) => {
  const config = modeConfig[leg.mode] || modeConfig.chauffeur;
  const Icon = config.icon;

  return (
    <div className="relative my-2 pl-9">
      {/* Vertical Stippl-inspired connecting rail */}
      <div className="absolute left-[31px] -top-3 bottom-0 w-0.5 border-l-2 border-dashed border-[#D5D1C7]" />

      {/* Interactive Transit Pill / Dislocation Card */}
      <button
        type="button"
        onClick={() => onInspect?.(leg)}
        className="group relative z-10 inline-flex max-w-full min-w-0 flex-wrap items-center gap-2.5 py-1.5 px-3 rounded-xl bg-white border border-[#E3DFD5] hover:border-[#143F4B]/50 hover:shadow-xs transition-all cursor-pointer text-xs"
      >
        {/* Time if this is a primary transfer */}
        {time && (
          <span className="font-mono text-xs font-semibold text-[#143F4B] pr-1 border-r border-[#E2DDD3]">
            {time}
          </span>
        )}

        {/* Mode Icon */}
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${config.bgPill}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Title or Modality */}
        {title ? <span className="font-semibold text-[#143F4B]">{title}</span> : null}

        {/* Duration & Distance */}
        <div className="flex items-center gap-1.5 font-medium text-[#143F4B]">
          <span className="font-semibold">
            <T text={leg.duration} source="pt" />
          </span>
          {leg.distance && (
            <>
              <span className="text-[#A8A49C]">·</span>
              <span className="text-[#698288]">{leg.distance}</span>
            </>
          )}
        </div>

        {/* Route Details */}
        {leg.routeNote && (
          <>
            <span className="hidden sm:inline text-[#D5D1C7]">|</span>
            <span className="text-[#4A636B] min-w-0 truncate max-w-full sm:max-w-xs text-[11px]">
              <T text={leg.routeNote} source="pt" />
            </span>
          </>
        )}

        {/* Algorithm Badge */}
        {leg.isAlgorithmOptimized && (
          <Badge
            variant="teal"
            className="text-[10px] py-0 px-1.5 h-4.5 gap-1 shrink-0 font-normal bg-[#EBF1F2] text-[#2D5B67] border-[#C3D7DB]"
          >
            <ShieldCheck className="w-2.5 h-2.5 text-[#2D5B67]" />
            <span>
              <T text="Algorithm Verified" source="en" />
            </span>
          </Badge>
        )}

        {/* Buffer Badge */}
        {leg.bufferMinutes && (
          <span className="text-[10px] text-[#8C877D] flex items-center gap-0.5 ml-auto">
            <Clock className="w-2.5 h-2.5" />
            <span>
              +{leg.bufferMinutes}
              <T text="m buffer" source="en" />
            </span>
          </span>
        )}

        {/* Inspect trigger hover arrow */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[#143F4B] ml-1">
          <Info className="w-3 h-3 text-[#698288]" />
        </div>
      </button>
    </div>
  );
};
