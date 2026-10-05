"use client";
import { T, useTranslated } from "@/components/LocaleProvider";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  MapPin,
  Clock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Navigation,
  Car,
  Footprints,
  Ship,
  Train,
} from "lucide-react";
import { TransitLeg, TransitMode } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TransitInspectorModalProps {
  leg: TransitLeg | null;
  onClose: () => void;
  onApplyMode?: (newMode: TransitMode, newBufferMinutes: number) => void;
}

export const TransitInspectorModal: React.FC<TransitInspectorModalProps> = ({
  leg,
  onClose,
  onApplyMode,
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useTranslated("Inspetor do Algoritmo de Roteamento", "pt");
  const closeLabel = useTranslated("Fechar", "pt");

  const [overrideMode, setOverrideMode] = useState<TransitMode | null>(null);
  const [overrideBuffer, setOverrideBuffer] = useState<number | null>(null);

  const selectedMode = overrideMode ?? (leg?.mode || "chauffeur");
  const selectedBuffer = overrideBuffer ?? leg?.bufferMinutes ?? (leg?.mode === "walk" ? 5 : 10);

  const handleClose = () => {
    setOverrideMode(null);
    setOverrideBuffer(null);
    onClose();
  };

  useEffect(() => {
    if (leg && !dialog.current?.open) dialog.current?.showModal();
    if (!leg && dialog.current?.open) dialog.current.close();
  }, [leg]);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={onClose}
      onClose={onClose}
      className="transit-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {leg && (
        <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain break-words rounded-2xl bg-white border border-[#D5D1C7] shadow-xl animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#F0ECE4] bg-[#FAF8F3]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#143F4B] text-white flex items-center justify-center">
                <Navigation className="w-4 h-4 text-[#D8A65C]" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wider uppercase text-[#698288]">
                  <T text="Detalhe do Trajeto e Deslocação" source="pt" />{" "}
                </p>
                <h3 className="font-serif-blu text-base font-bold text-[#143F4B]">
                  <T text="Inspetor do Algoritmo de Roteamento" source="pt" />{" "}
                </h3>
              </div>
            </div>
            <button
              aria-label={closeLabel}
              autoFocus
              onClick={handleClose}
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
                <span className="font-semibold text-[#143F4B]">
                  <T text="Origem:" source="pt" />
                </span>
                <span className="text-[#3A535B]">{leg.fromLocation}</span>
              </div>
              <div className="pl-1.5 py-0.5 border-l-2 border-dashed border-[#C9C4B7] ml-1.5 flex items-center gap-2 text-[11px] text-[#698288]">
                <Clock className="w-3 h-3 text-[#A8A49C]" />
                <span>
                  {leg.duration} · {leg.distance}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#D8A65C] shrink-0" />
                <span className="font-semibold text-[#143F4B]">
                  <T text="Destino:" source="pt" />
                </span>
                <span className="text-[#3A535B]">{leg.toLocation}</span>
              </div>
            </div>

            {/* Algorithm Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#143F4B]">
                  <T text="Justificação da Otimização do Trajeto" source="pt" />
                </span>
                <Badge variant="teal" className="text-[10px]">
                  <ShieldCheck className="w-3 h-3 text-[#2D5B67] mr-1" />
                  <T text="Conforme Regras BLU" source="pt" />{" "}
                </Badge>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-[#E2DDD3] space-y-2.5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#143F4B]">
                      <T text="Avaliação de Terreno e Mobilidade (Regra R15)" source="pt" />
                    </p>
                    <p className="text-[11px] text-[#698288] mt-0.5">
                      {leg.mode === "walk"
                        ? "O algoritmo selecionou um corredor pedonal acessível, evitando escadarias íngremes de calçada."
                        : "Drop-off direto porta-a-porta com motorista privado em frente à entrada do local."}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#143F4B]">
                      <T text="Margem de Trânsito e Ritmo (Regras R01, R03)" source="pt" />
                    </p>
                    <p className="text-[11px] text-[#698288] mt-0.5">
                      {`Adicionada margem de segurança de +${leg.bufferMinutes || 10} min para salvaguardar reservas de mesa e garantir um ritmo descontraído.`}
                    </p>
                  </div>
                </div>

                {leg.routeNote && (
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-[#D8A65C] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#143F4B]">
                        <T text="Camada Cénica e Curadoria" source="pt" />
                      </p>
                      <p className="text-[11px] text-[#698288] mt-0.5">
                        <T text={leg.routeNote} source="pt" />
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Mode & Buffer Customization */}
            {onApplyMode && (
              <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E3DFD5] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[#143F4B]">
                    <T text="Adaptar Modalidade de Deslocação" source="pt" />
                  </span>
                  <span className="text-[10px] text-[#698288]">
                    <T text="Recálculo dinâmico via OSRM" source="pt" />
                  </span>
                </div>

                {/* Modality options */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOverrideMode("chauffeur");
                      setOverrideBuffer(10);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      selectedMode === "chauffeur"
                        ? "bg-[#143F4B] text-white border-[#143F4B] shadow-xs"
                        : "bg-white text-[#4A636B] border-[#DDD8CE] hover:border-[#143F4B]/40"
                    }`}
                  >
                    <Car className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-semibold text-xs block">Carro Privado</span>
                      <span
                        className={`text-[10px] block ${selectedMode === "chauffeur" ? "text-slate-200" : "text-[#8C877D]"}`}
                      >
                        Chauffeur porta-a-porta
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOverrideMode("walk");
                      setOverrideBuffer(5);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      selectedMode === "walk"
                        ? "bg-[#2D5B67] text-white border-[#2D5B67] shadow-xs"
                        : "bg-white text-[#4A636B] border-[#DDD8CE] hover:border-[#2D5B67]/40"
                    }`}
                  >
                    <Footprints className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-semibold text-xs block">A Pé</span>
                      <span
                        className={`text-[10px] block ${selectedMode === "walk" ? "text-slate-200" : "text-[#8C877D]"}`}
                      >
                        Caminhada pedonal
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOverrideMode("boat");
                      setOverrideBuffer(15);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      selectedMode === "boat"
                        ? "bg-[#1A5C70] text-white border-[#1A5C70] shadow-xs"
                        : "bg-white text-[#4A636B] border-[#DDD8CE] hover:border-[#1A5C70]/40"
                    }`}
                  >
                    <Ship className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-semibold text-xs block">Barco Fluvial</span>
                      <span
                        className={`text-[10px] block ${selectedMode === "boat" ? "text-slate-200" : "text-[#8C877D]"}`}
                      >
                        Travessia cénica
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOverrideMode("train");
                      setOverrideBuffer(15);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      selectedMode === "train"
                        ? "bg-[#9E6E24] text-white border-[#9E6E24] shadow-xs"
                        : "bg-white text-[#4A636B] border-[#DDD8CE] hover:border-[#9E6E24]/40"
                    }`}
                  >
                    <Train className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-semibold text-xs block">Comboio / Rail</span>
                      <span
                        className={`text-[10px] block ${selectedMode === "train" ? "text-slate-200" : "text-[#8C877D]"}`}
                      >
                        Linha panorâmica
                      </span>
                    </div>
                  </button>
                </div>

                {/* Buffer selector */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-[#4A636B]">
                    <T text="Margem de Segurança (Trânsito/Espera):" source="pt" />
                  </span>
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 20].map((buf) => (
                      <button
                        key={buf}
                        type="button"
                        onClick={() => setOverrideBuffer(buf)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          selectedBuffer === buf
                            ? "bg-[#143F4B] text-white"
                            : "bg-white border border-[#D5D1C7] text-[#4A636B] hover:bg-[#F4F0E7]"
                        }`}
                      >
                        +{buf}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EAE6DF] text-center">
                <span className="block text-[10px] text-[#8C877D] uppercase font-medium">
                  <T text="Modalidade" source="pt" />
                </span>
                <span className="font-semibold text-xs text-[#143F4B] capitalize">
                  <T text={leg.mode} source="pt" />
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EAE6DF] text-center">
                <span className="block text-[10px] text-[#8C877D] uppercase font-medium">
                  <T text="Tempo de Deslocação" source="pt" />
                </span>
                <span className="font-semibold text-xs text-[#143F4B]">
                  <T text={leg.duration} source="pt" />
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EAE6DF] text-center">
                <span className="block text-[10px] text-[#8C877D] uppercase font-medium">
                  <T text="Margem de Segurança" source="pt" />
                </span>
                <span className="font-semibold text-xs text-[#2D5B67]">
                  +{leg.bufferMinutes || 15}
                  <T text=" min" source="pt" />
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-t border-[#F0ECE4] bg-[#FAF8F3]">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="text-xs border-[#D5D1C7] text-[#4A636B]"
            >
              <T text="Fechar" source="pt" />
            </Button>
            {onApplyMode ? (
              <Button
                variant="primaryDark"
                size="sm"
                onClick={() => {
                  onApplyMode(selectedMode, selectedBuffer);
                  handleClose();
                }}
                className="bg-[#143F4B] text-white hover:bg-[#0E2D36] text-xs"
              >
                <T text="Aplicar e Recalcular Trajeto" source="pt" />
              </Button>
            ) : (
              <Button
                variant="primaryDark"
                size="sm"
                onClick={handleClose}
                className="bg-[#143F4B] text-white hover:bg-[#0E2D36]"
              >
                <T text="Concluído" source="pt" />
              </Button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
};
