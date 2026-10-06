"use client";

import { useEffect, useRef, useState } from "react";
import { fetchDayWeather, type DayWeatherResult } from "@/lib/weather";
import { useLocale } from "./LocaleProvider";
import { ExternalLink, X, Info, CheckCircle2, AlertCircle } from "lucide-react";

interface DayWeatherBadgeProps {
  date: string;
  location?: string;
  items?: Array<{ latitude?: number | null; longitude?: number | null }>;
}

export function DayWeatherBadge({ date, location, items }: DayWeatherBadgeProps) {
  const { locale } = useLocale();
  const [result, setResult] = useState<DayWeatherResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchDayWeather({ date, location, items })
      .then((res) => {
        if (active) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setResult({
            status: "unavailable",
            messagePt: "Meteorologia indisponível",
            messageEn: "Weather unavailable",
          });
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [date, location, items]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (loading) {
    return (
      <span
        aria-label="A carregar meteorologia"
        className="inline-flex items-center h-5 w-16 rounded-full bg-[#EAE6DD] animate-pulse"
      />
    );
  }

  if (!result || result.status === "unavailable") {
    return null;
  }

  const { weather } = result;
  const isEn = locale === "en";
  const condition = isEn ? weather.conditionEn : weather.conditionPt;

  const googleWeatherUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `tempo ${location || "Portugal"} ${date}`,
  )}`;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Badge button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none hover:shadow-xs hover:border-[#2D5B67] ${
          weather.isRainy
            ? "bg-[#EBF3F5] text-[#1E4A56] border-[#BCD4DC]"
            : "bg-[#F9F7F2] text-[#334E57] border-[#DDD8CE]"
        }`}
        title={
          isEn
            ? "Click to view weather verification & source details"
            : "Clique para verificar a meteorologia e detalhes da fonte"
        }
      >
        <span className="text-sm leading-none" aria-hidden="true">
          {weather.icon}
        </span>
        <span>
          {weather.maxTemp}° / {weather.minTemp}°C
        </span>
        {weather.isHistorical ? (
          <span className="text-[10px] tracking-tight text-[#6A8288] font-normal">
            (Hist.)
          </span>
        ) : (
          weather.precipitationProbability !== undefined &&
          weather.precipitationProbability > 0 && (
            <span
              className="text-[11px] opacity-85 flex items-center gap-0.5 text-[#245464]"
              aria-label={`${weather.precipitationProbability}% chance of rain`}
            >
              <span aria-hidden="true">💧</span>
              <span>{weather.precipitationProbability}%</span>
            </span>
          )
        )}
      </button>

      {/* Verification Popover */}
      {open && (
        <div
          role="dialog"
          aria-label={isEn ? "Weather Details" : "Detalhes Meteorológicos"}
          className="absolute left-0 top-full mt-2 z-40 w-72 sm:w-80 rounded-xl border border-[#DDD8CE] bg-white p-4 shadow-xl text-[#143F4B] animate-in fade-in zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#F0ECE4]">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">
                {weather.icon}
              </span>
              <div>
                <h3 className="font-semibold text-sm leading-tight text-[#143F4B]">
                  {condition}
                </h3>
                <p className="text-xs text-[#6A8288]">
                  {location || "Destino"} · {date}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[#888] hover:text-[#143F4B] p-1 rounded-md transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Core Weather Numbers */}
          <div className="grid grid-cols-2 gap-2 my-3 text-xs bg-[#FAF8F3] p-2.5 rounded-lg border border-[#EDE8DF]">
            <div>
              <span className="text-[#6A8288] block text-[11px]">
                {isEn ? "Temperature" : "Temperatura"}
              </span>
              <span className="font-semibold text-sm text-[#143F4B]">
                {weather.maxTemp}°C / {weather.minTemp}°C
              </span>
            </div>
            <div>
              <span className="text-[#6A8288] block text-[11px]">
                {weather.isHistorical
                  ? isEn
                    ? "Recorded Rain"
                    : "Chuva Medida"
                  : isEn
                  ? "Rain Chance"
                  : "Prob. Chuva"}
              </span>
              <span className="font-semibold text-sm text-[#143F4B]">
                {weather.isHistorical
                  ? `${(weather.precipitationSum ?? 0).toFixed(1)} mm`
                  : `${weather.precipitationProbability ?? 0}%`}
              </span>
            </div>
          </div>

          {/* Coordinates and Source explanation */}
          <div className="mb-3 space-y-1.5 text-xs">
            <p className="text-[11px] text-[#6A8288] flex items-center justify-between">
              <span>{isEn ? "Coordinates:" : "Coordenadas:"}</span>
              <span className="font-mono text-[#334E57]">
                {weather.latitude.toFixed(3)}°, {weather.longitude.toFixed(3)}°
              </span>
            </p>

            {weather.isHistorical ? (
              <div className="flex items-start gap-1.5 text-[11px] text-[#855314] bg-amber-50/80 p-2 rounded-md border border-amber-200/60 leading-normal">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D8A65C]" />
                <span>
                  {isEn
                    ? `Historical reference (${weather.historicalReferenceYear ?? 2025}) via Open-Meteo Archive. Real-time forecast updates 14 days before arrival.`
                    : `Referência histórica de ${weather.historicalReferenceYear ?? 2025} via Open-Meteo Archive. A previsão em direto atualiza a 14 dias da viagem.`}
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-1.5 text-[11px] text-[#1E4A56] bg-teal-50/80 p-2 rounded-md border border-teal-200/60 leading-normal">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#2D5B67]" />
                <span>
                  {isEn
                    ? "Live forecast generated from global weather models (DWD ICON / ECMWF via Open-Meteo)."
                    : "Previsão em tempo real dos modelos meteorológicos globais (DWD ICON / ECMWF via Open-Meteo)."}
                </span>
              </div>
            )}
          </div>

          {/* Verification Links */}
          <div className="space-y-1.5 pt-2 border-t border-[#F0ECE4]">
            <a
              href={weather.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs rounded-md bg-[#FAF8F3] hover:bg-[#F2ECE1] text-[#143F4B] border border-[#DDD8CE] transition-colors"
            >
              <span>{isEn ? "Verify API response (Open-Meteo)" : "Verificar dados da API (Open-Meteo)"}</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#6A8288]" />
            </a>

            <a
              href={googleWeatherUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs rounded-md bg-[#FAF8F3] hover:bg-[#F2ECE1] text-[#143F4B] border border-[#DDD8CE] transition-colors"
            >
              <span>{isEn ? "Cross-check on Google Weather" : "Confirmar no Google Weather"}</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#6A8288]" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
