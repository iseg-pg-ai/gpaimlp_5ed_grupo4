"use client";
import { T } from "@/components/LocaleProvider";


import React from "react";
import { Plus, MapPin, Compass, ShieldCheck } from "lucide-react";
import { RecentTrip } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  currentTripId: string;
  onSelectTrip: (tripId: string) => void;
  onNewTrip: () => void;
  recentTrips: RecentTrip[];
  isNewTripActive: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTripId,
  onSelectTrip,
  onNewTrip,
  recentTrips,
  isNewTripActive,
}) => {
  return (
    <aside className="w-64 shrink-0 border-r border-[#D5D1C7] bg-[#EBE5DA] flex flex-col justify-between h-full select-none">
      {/* Top Header / BLU Costa Branding */}
      <div>
        <div className="p-4 border-b border-[#D5D1C7] bg-[#F4F0E7]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#143F4B] flex items-center justify-center text-[#D8A65C] shadow-xs">
              <span className="font-serif-blu font-bold text-sm tracking-widest">B</span>
            </div>
            <div>
              <span className="font-serif-blu font-bold text-sm tracking-tight text-[#143F4B] block leading-tight">
                BLU COSTA
              </span>
              <span className="text-[10px] text-[#4A636B] font-medium tracking-widest uppercase"><T text="Travel Curation" source="en"/>{" "}</span>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-[#7E9399] tracking-wider uppercase font-semibold"><T text="Portugal · Studio" source="en"/>{" "}</div>
        </div>

        {/* Action Button: New Trip via Shadcn Button */}
        <div className="p-3">
          <Button
            variant={isNewTripActive ? "default" : "outline"}
            onClick={onNewTrip}
            className="w-full gap-2 justify-center shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span><T text="New Trip Brief" source="en"/></span>
          </Button>
        </div>

        {/* Recent Projects Section */}
        <div className="px-3 pt-2">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-semibold tracking-widest text-[#4A636B] uppercase"><T text="Recent Journeys" source="en"/>{" "}</span>
            <span className="text-[10px] text-[#7E9399] font-mono">
              {recentTrips.length}
            </span>
          </div>

          <div className="space-y-1">
            {recentTrips.map((trip) => {
              const isSelected = !isNewTripActive && currentTripId === trip.id;
              return (
                <button
                  key={trip.id}
                  onClick={() => onSelectTrip(trip.id)}
                  className={`w-full text-left p-2.5 rounded-lg transition-all text-xs cursor-pointer group flex items-center justify-between ${
                    isSelected
                      ? "bg-white border border-[#2D5B67]/40 text-[#143F4B] shadow-xs"
                      : "hover:bg-black/[0.04] text-[#2D4A52] border border-transparent"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-medium truncate ${isSelected ? "text-[#2D5B67] font-semibold" : "text-[#143F4B]"}`}>
                        {trip.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#698288] mt-0.5 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{trip.destination}</span>
                      <span>·</span>
                      <span className="shrink-0">{trip.dates}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#D8A65C] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer / BLU Principles Reassurance */}
      <div className="p-3 border-t border-[#D5D1C7] bg-[#E3DCD0] text-[10px] text-[#4A636B]">
        <div className="flex items-center gap-1.5 font-medium mb-1 text-[#143F4B]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2D5B67]" />
          <span><T text="Curated with Care" source="en"/></span>
        </div>
        <p className="text-[10px] text-[#698288] leading-tight"><T text="RNAAT Registered · 26/2026" source="en"/>{" "}<br /><T text="Lisbon HQ · Portugal" source="en"/>{" "}</p>
      </div>
    </aside>
  );
};
