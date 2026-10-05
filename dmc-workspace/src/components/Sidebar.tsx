"use client";
import { T } from "@/components/LocaleProvider";

import React from "react";
import { Plus, MapPin, ShieldCheck, Trash2 } from "lucide-react";
import { RecentTrip } from "@/types";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  currentTripId: string;
  onSelectTrip: (tripId: string) => void;
  onNewTrip: () => void;
  onTrashTrip: (tripId: string) => void;
  recentTrips: RecentTrip[];
  isNewTripActive: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTripId,
  onSelectTrip,
  onNewTrip,
  onTrashTrip,
  recentTrips,
  isNewTripActive,
}) => {
  return (
    <aside className="w-full lg:w-64 shrink-0 border-r border-[#D5D1C7] bg-[#EBE5DA] flex flex-col justify-between h-full select-none">
      {/* Top Header / BLU Costa Branding */}
      <div>
        {/* Action Button: New Trip via Shadcn Button */}
        <div className="p-3">
          <Button
            variant={isNewTripActive ? "default" : "outline"}
            onClick={onNewTrip}
            className="w-full gap-2 justify-center shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>
              <T text="New Trip Brief" source="en" />
            </span>
          </Button>
        </div>

        {/* Recent Projects Section */}
        <div className="px-3 pt-2">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-xs font-semibold tracking-widest text-[#4A636B]">
              <T text="Recent Journeys" source="en" />{" "}
            </span>
            <span className="text-xs text-[#4A636B] font-mono">{recentTrips.length}</span>
          </div>

          <div className="space-y-1">
            {recentTrips.map((trip) => {
              const isSelected = !isNewTripActive && currentTripId === trip.id;
              return (
                <div
                  key={trip.id}
                  className={`w-full rounded-lg transition-all text-sm group flex items-center ${
                    isSelected
                      ? "bg-white border border-[#2D5B67]/40 text-[#143F4B] shadow-xs"
                      : "hover:bg-black/[0.04] text-[#2D4A52] border border-transparent"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTrip(trip.id)}
                    className="min-w-0 flex-1 p-2.5 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium truncate ${isSelected ? "text-[#2D5B67] font-semibold" : "text-[#143F4B]"}`}
                      >
                        {trip.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#698288] mt-0.5 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{trip.destination}</span>
                      <span>·</span>
                      <span className="shrink-0">{trip.dates}</span>
                    </div>
                  </button>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#D8A65C] shrink-0" />}
                  <button
                    type="button"
                    onClick={() => onTrashTrip(trip.id)}
                    className="m-1.5 inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[#7D4A43] hover:bg-[#F7E9E6]"
                    aria-label={`Enviar viagem ${trip.name} para o Lixo`}
                    title="Enviar viagem para o Lixo"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer / BLU Principles Reassurance */}
      <div className="p-3 border-t border-[#D5D1C7] bg-[#E3DCD0] text-xs text-[#4A636B]">
        <div className="flex items-center gap-1.5 font-medium mb-1 text-[#143F4B]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2D5B67]" />
          <span>
            <T text="Curated with Care" source="en" />
          </span>
        </div>
        <p className="text-xs text-[#698288] leading-tight">
          <T text="RNAAT Registered · 26/2026" source="en" /> <br />
          <T text="Lisbon HQ · Portugal" source="en" />{" "}
        </p>
      </div>
    </aside>
  );
};
