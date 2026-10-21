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
    label: "Motorista Privado",
    icon: Car,
    accentColor: "text-[var(--portal-text-143f4b)]",
    bgPill:
      "bg-[var(--portal-bg-f4f0e7)] text-[var(--portal-text-143f4b)] border-[var(--portal-line-d5d1c7)]",
  },
  walk: {
    label: "Caminhada Pedonal",
    icon: Footprints,
    accentColor: "text-[var(--portal-text-2d5b67)]",
    bgPill:
      "bg-[var(--portal-bg-eaf0f1)] text-[var(--portal-text-2d5b67)] border-[var(--portal-line-bcd0d4)]",
  },
  boat: {
    label: "Barco Cénico / Rabelo",
    icon: Ship,
    accentColor: "text-[var(--portal-text-1a5c70)]",
    bgPill:
      "bg-[var(--portal-bg-e5f3f7)] text-[var(--portal-text-1a5c70)] border-[var(--portal-line-a8d3e0)]",
  },
  train: {
    label: "Comboio Panorâmico",
    icon: Train,
    accentColor: "text-[var(--portal-text-9e6e24)]",
    bgPill:
      "bg-[var(--portal-bg-fbf4e8)] text-[var(--portal-text-9e6e24)] border-[var(--portal-line-e8d4b0)]",
  },
  funicular: {
    label: "Funicular Histórico",
    icon: Train,
    accentColor: "text-[var(--portal-text-9e6e24)]",
    bgPill:
      "bg-[var(--portal-bg-fbf4e8)] text-[var(--portal-text-9e6e24)] border-[var(--portal-line-e8d4b0)]",
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
      <div className="absolute left-[31px] -top-3 bottom-0 w-0.5 border-l-2 border-dashed border-[var(--portal-line-d5d1c7)]" />

      {/* Interactive Transit Pill / Dislocation Card */}
      <button
        type="button"
        onClick={() => onInspect?.(leg)}
        title="Clique para ver detalhes ou alterar modalidade de deslocação"
        className="group relative z-10 inline-flex max-w-full min-w-0 flex-wrap items-center gap-2.5 py-1.5 px-3 rounded-xl bg-[var(--portal-white)] border border-[var(--portal-line-e3dfd5)] hover:border-[var(--portal-line-143f4b)]/50 hover:shadow-xs transition-all cursor-pointer text-xs"
      >
        {/* Time if this is a primary transfer */}
        {time && (
          <span className="font-mono text-xs font-semibold text-[var(--portal-text-143f4b)] pr-1 border-r border-[var(--portal-line-e2ddd3)]">
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
        {title ? (
          <span className="font-semibold text-[var(--portal-text-143f4b)]">
            <T text={title} source="pt" />
          </span>
        ) : (
          <span className="font-semibold text-[var(--portal-text-143f4b)]">
            <T text={config.label} source="pt" />
          </span>
        )}

        {/* Duration & Distance */}
        <div className="flex items-center gap-1.5 font-medium text-[var(--portal-text-143f4b)]">
          <span className="font-semibold">
            <T text={leg.duration} source="pt" />
          </span>
          {leg.distance && (
            <>
              <span className="text-[var(--portal-text-a8a49c)]">·</span>
              <span className="text-[var(--portal-text-698288)]">{leg.distance}</span>
            </>
          )}
        </div>

        {/* Route Details */}
        {leg.routeNote && (
          <>
            <span className="hidden sm:inline text-[#D5D1C7]">|</span>
            <span className="text-[var(--portal-text-4a636b)] min-w-0 truncate max-w-full sm:max-w-xs text-[11px]">
              <T text={leg.routeNote} source="pt" />
            </span>
          </>
        )}

        {/* Algorithm Badge */}
        {leg.isAlgorithmOptimized && (
          <Badge
            variant="teal"
            className="text-[10px] py-0 px-1.5 h-4.5 gap-1 shrink-0 font-normal bg-[var(--portal-bg-ebf1f2)] text-[var(--portal-text-2d5b67)] border-[var(--portal-line-c3d7db)]"
          >
            <ShieldCheck className="w-2.5 h-2.5 text-[var(--portal-text-2d5b67)]" />
            <span>
              <T text="Trajeto Verificado" source="pt" />
            </span>
          </Badge>
        )}

        {/* Buffer Badge */}
        {leg.bufferMinutes && (
          <span className="text-[10px] text-[var(--portal-text-8c877d)] flex items-center gap-0.5 ml-auto">
            <Clock className="w-2.5 h-2.5" />
            <span>
              +{leg.bufferMinutes}
              <T text=" min margem" source="pt" />
            </span>
          </span>
        )}

        {/* Inspect trigger hover arrow */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--portal-text-143f4b)] ml-1">
          <Info className="w-3 h-3 text-[var(--portal-text-698288)]" />
        </div>
      </button>
    </div>
  );
};
