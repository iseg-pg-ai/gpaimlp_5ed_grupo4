// Apresenta o contexto meteorológico do dia sem o tornar uma condição confirmada do
// itinerário.
"use client";

import { useEffect, useId, useState } from "react";
import { fetchDayWeather, type DayWeatherResult } from "@/lib/weather";
import { useLocale } from "./LocaleProvider";
import { ExternalLink, X, CheckCircle2, AlertCircle } from "lucide-react";

interface DayWeatherBadgeProps {
  date: string;
  location?: string;
  items?: Array<{ latitude?: number | null; longitude?: number | null }>;
}

export function DayWeatherBadge({ date, location, items }: DayWeatherBadgeProps) {
  const { locale } = useLocale();
  const requestKey = JSON.stringify({
    date,
    location,
    items: items?.map(({ latitude, longitude }) => ({ latitude, longitude })),
  });
  const [response, setResponse] = useState<{
    requestKey: string;
    result: DayWeatherResult;
  } | null>(null);
  const result = response?.requestKey === requestKey ? response.result : null;
  const loading = result === null;
  const popoverId = `weather-${useId()}`;

  useEffect(() => {
    let active = true;
    fetchDayWeather(JSON.parse(requestKey))
      .then((res) => {
        if (active) {
          setResponse({ requestKey, result: res });
        }
      })
      .catch(() => {
        if (active) {
          setResponse({
            requestKey,
            result: {
              status: "unavailable",
              messagePt: "Meteorologia indisponível",
              messageEn: "Weather unavailable",
            },
          });
        }
      });

    return () => {
      active = false;
    };
  }, [requestKey]);

  if (loading) {
    return (
      <span
        aria-label="A carregar meteorologia"
        className="inline-flex items-center h-5 w-16 rounded-full bg-[var(--portal-bg-eae6dd)] animate-pulse"
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
    <div className="relative inline-block">
      {/* Badge button */}
      <button
        type="button"
        popoverTarget={popoverId}
        data-testid="day-weather"
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none hover:shadow-xs hover:border-[var(--portal-line-2d5b67)] ${
          weather.isRainy
            ? "bg-[var(--portal-bg-ebf3f5)] text-[var(--portal-text-1e4a56)] border-[var(--portal-line-bcd4dc)]"
            : "bg-[var(--portal-bg-f9f7f2)] text-[var(--portal-text-334e57)] border-[var(--portal-line-ddd8ce)]"
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
          <span className="text-[10px] tracking-tight text-[var(--portal-text-6a8288)] font-normal">
            (Hist.)
          </span>
        ) : (
          weather.precipitationProbability !== undefined &&
          weather.precipitationProbability > 0 && (
            <span
              className="text-[11px] opacity-85 flex items-center gap-0.5 text-[var(--portal-text-245464)]"
              aria-label={`${weather.precipitationProbability}% chance of rain`}
            >
              <span aria-hidden="true">💧</span>
              <span>{weather.precipitationProbability}%</span>
            </span>
          )
        )}
      </button>

      {/* Verification Popover */}
      <div
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-label={isEn ? "Weather Details" : "Detalhes Meteorológicos"}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto sm:w-80 rounded-xl border border-[var(--portal-line-ddd8ce)] bg-[var(--portal-white)] p-4 shadow-xl text-[var(--portal-text-143f4b)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[var(--portal-line-f0ece4)]">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">
              {weather.icon}
            </span>
            <div>
              <h3 className="font-semibold text-sm leading-tight text-[var(--portal-text-143f4b)]">
                {condition}
              </h3>
              <p className="text-xs text-[var(--portal-text-6a8288)]">
                {location || "Destino"} · {date}
              </p>
            </div>
          </div>
          <button
            type="button"
            popoverTarget={popoverId}
            popoverTargetAction="hide"
            autoFocus
            className="text-[var(--portal-text-888888)] hover:text-[var(--portal-text-143f4b)] p-1 rounded-md transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Core Weather Numbers */}
        <div className="grid grid-cols-2 gap-2 my-3 text-xs bg-[var(--portal-bg-faf8f3)] p-2.5 rounded-lg border border-[var(--portal-line-ede8df)]">
          <div>
            <span className="text-[var(--portal-text-6a8288)] block text-[11px]">
              {isEn ? "Temperature" : "Temperatura"}
            </span>
            <span className="font-semibold text-sm text-[var(--portal-text-143f4b)]">
              {weather.maxTemp}°C / {weather.minTemp}°C
            </span>
          </div>
          <div>
            <span className="text-[var(--portal-text-6a8288)] block text-[11px]">
              {weather.isHistorical
                ? isEn
                  ? "Recorded Rain"
                  : "Chuva Medida"
                : isEn
                  ? "Rain Chance"
                  : "Prob. Chuva"}
            </span>
            <span className="font-semibold text-sm text-[var(--portal-text-143f4b)]">
              {weather.isHistorical
                ? weather.precipitationSum === undefined
                  ? isEn
                    ? "Unconfirmed"
                    : "Por confirmar"
                  : `${weather.precipitationSum.toFixed(1)} mm`
                : weather.precipitationProbability === undefined
                  ? isEn
                    ? "Unconfirmed"
                    : "Por confirmar"
                  : `${weather.precipitationProbability}%`}
            </span>
          </div>
        </div>

        {/* Coordinates and Source explanation */}
        <div className="mb-3 space-y-1.5 text-xs">
          <p className="text-[11px] text-[var(--portal-text-6a8288)] flex items-center justify-between">
            <span>{isEn ? "Coordinates:" : "Coordenadas:"}</span>
            <span className="font-mono text-[var(--portal-text-334e57)]">
              {weather.latitude.toFixed(3)}°, {weather.longitude.toFixed(3)}°
            </span>
          </p>

          {weather.isHistorical ? (
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--portal-text-855314)] bg-amber-50/80 p-2 rounded-md border border-amber-200/60 leading-normal">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--portal-text-d8a65c)]" />
              <span>
                {isEn
                  ? `Historical reference (${weather.historicalReferenceYear ?? 2025}) via Open-Meteo Archive. Real-time forecast updates 14 days before arrival.`
                  : `Referência histórica de ${weather.historicalReferenceYear ?? 2025} via Open-Meteo Archive. A previsão em direto atualiza a 14 dias da viagem.`}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--portal-text-1e4a56)] bg-teal-50/80 p-2 rounded-md border border-teal-200/60 leading-normal">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--portal-text-2d5b67)]" />
              <span>
                {isEn
                  ? "Live forecast generated from global weather models (DWD ICON / ECMWF via Open-Meteo)."
                  : "Previsão em tempo real dos modelos meteorológicos globais (DWD ICON / ECMWF via Open-Meteo)."}
              </span>
            </div>
          )}
        </div>

        {/* Verification Links */}
        <div className="space-y-1.5 pt-2 border-t border-[var(--portal-line-f0ece4)]">
          <a
            href={weather.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--portal-bg-faf8f3)] hover:bg-[var(--portal-bg-f2ece1)] text-[var(--portal-text-143f4b)] border border-[var(--portal-line-ddd8ce)] transition-colors"
          >
            <span>
              {isEn ? "Verify API response (Open-Meteo)" : "Verificar dados da API (Open-Meteo)"}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--portal-text-6a8288)]" />
          </a>

          <a
            href={googleWeatherUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs rounded-md bg-[var(--portal-bg-faf8f3)] hover:bg-[var(--portal-bg-f2ece1)] text-[var(--portal-text-143f4b)] border border-[var(--portal-line-ddd8ce)] transition-colors"
          >
            <span>{isEn ? "Cross-check on Google Weather" : "Confirmar no Google Weather"}</span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--portal-text-6a8288)]" />
          </a>
        </div>
      </div>
    </div>
  );
}
