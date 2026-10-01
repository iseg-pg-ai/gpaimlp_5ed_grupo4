"use client";
import { T, useTranslated } from "@/components/LocaleProvider";


import React, { useEffect, useRef } from "react";
import { 
  X, 
  Car, 
  Footprints, 
  Ship, 
  Train, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight,
  Sliders,
  CheckCircle2,
  Navigation
} from "lucide-react";
import { TransitLeg } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TransitInspectorModalProps {
  leg: TransitLeg | null;
  onClose: () => void;
}

export const TransitInspectorModal: React.FC<TransitInspectorModalProps> = ({
  leg,
  onClose,
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useTranslated("Routing Algorithm Inspector");
  const closeLabel = useTranslated("Done");
  useEffect(() => {
    if (leg && !dialog.current?.open) dialog.current?.showModal();
    if (!leg && dialog.current?.open) dialog.current.close();
  }, [leg]);

  return (
    <dialog ref={dialog} aria-label={title} onCancel={onClose} onClose={onClose}
      className="transit-dialog" onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}>
      {leg &&
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain break-words rounded-2xl bg-white border border-[#D5D1C7] shadow-xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#F0ECE4] bg-[#FAF8F3]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#143F4B] text-white flex items-center justify-center">
              <Navigation className="w-4 h-4 text-[#D8A65C]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider uppercase text-[#698288]"><T text="Stippl-Style Dislocation Leg" source="en"/>{" "}</p>
              <h3 className="font-serif-blu text-base font-bold text-[#143F4B]"><T text="Routing Algorithm Inspector" source="en"/>{" "}</h3>
            </div>
          </div>
          <button
            aria-label={closeLabel} autoFocus onClick={onClose}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-[#8C877D] hover:bg-black/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-[#2D5B67]">
          {/* Route Origin -> Destination */}
          <div className="p-3.5 rounded-xl bg-[#F7F5EE] border border-[#E6E1D5] space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[#143F4B] shrink-0" />
              <span className="font-semibold text-[#143F4B]"><T text="From:" source="en"/></span>
              <span className="text-[#3A535B]">{leg.fromLocation}</span>
            </div>
            <div className="pl-1.5 py-0.5 border-l-2 border-dashed border-[#C9C4B7] ml-1.5 flex items-center gap-2 text-[11px] text-[#698288]">
              <Clock className="w-3 h-3 text-[#A8A49C]" />
              <span>{leg.duration} · {leg.distance}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[#D8A65C] shrink-0" />
              <span className="font-semibold text-[#143F4B]"><T text="To:" source="en"/></span>
              <span className="text-[#3A535B]">{leg.toLocation}</span>
            </div>
          </div>

          {/* Algorithm Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#143F4B]"><T text="Routing Optimization Rationale" source="en"/></span>
              <Badge variant="teal" className="text-[10px]">
                <ShieldCheck className="w-3 h-3 text-[#2D5B67] mr-1" /><T text="BLU Rules Compliant" source="en"/>{" "}</Badge>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-[#E2DDD3] space-y-2.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[#143F4B]"><T text="Terrain & Mobility Evaluation (Rule R15)" source="en"/></p>
                  <p className="text-[11px] text-[#698288] mt-0.5">
                    {leg.mode === "walk"
                      ? "Algorithm selected a level pedestrian corridor avoiding steep Lisbon/Porto calçada stairways."
                      : "Private chauffeur door-to-door drop-off selected directly in front of the venue entrance."}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[#143F4B]"><T text="Traffic Buffer & Pacing (Rule R01, R03)" source="en"/></p>
                  <p className="text-[11px] text-[#698288] mt-0.5"><T text="Added +" source="en"/>{leg.bufferMinutes || 15}<T text="min safety buffer to safeguard restaurant table reservation time and relaxed dining rhythm." source="en"/>{" "}</p>
                </div>
              </div>

              {leg.routeNote && (
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[#D8A65C] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#143F4B]"><T text="Curatorial Scenery Layer" source="en"/></p>
                    <p className="text-[11px] text-[#698288] mt-0.5">
                      <T text={leg.routeNote} source="pt"/>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EAE6DF] text-center">
              <span className="block text-[10px] text-[#8C877D] uppercase font-medium"><T text="Modality" source="en"/></span>
              <span className="font-semibold text-xs text-[#143F4B] capitalize"><T text={leg.mode} source="pt"/></span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EAE6DF] text-center">
              <span className="block text-[10px] text-[#8C877D] uppercase font-medium"><T text="Transfer Time" source="en"/></span>
              <span className="font-semibold text-xs text-[#143F4B]"><T text={leg.duration} source="pt"/></span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EAE6DF] text-center">
              <span className="block text-[10px] text-[#8C877D] uppercase font-medium"><T text="Safety Buffer" source="en"/></span>
              <span className="font-semibold text-xs text-[#2D5B67]">+{leg.bufferMinutes || 15}<T text="m" source="en"/></span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-t border-[#F0ECE4] bg-[#FAF8F3]">
          <span className="text-[11px] text-[#8C877D] italic"><T text="Computed by BLU Logistics Routing Engine" source="en"/>{" "}</span>
          <Button 
            variant="primaryDark"
            size="sm"
            onClick={onClose}
            className="bg-[#143F4B] text-white hover:bg-[#0E2D36]"
          ><T text="Done" source="en"/>{" "}</Button>
        </div>
      </div>}
    </dialog>
  );
};
