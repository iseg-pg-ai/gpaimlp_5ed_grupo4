"use client";
import { useEffect, useMemo, useState } from "react";
import { T } from "@/components/LocaleProvider";
import { portalFetch } from "@/lib/http-client";
import { fitPoints, project } from "@/lib/map-projection";
import { proposalStops } from "@/lib/proposal-map";
import type { ItineraryDay } from "@/types";

// Cores por dia, distintas entre si e legíveis sobre o fundo claro do mapa.
const DAY_COLORS = ["#2d5b67", "#b57939", "#75866a", "#8a4f7d", "#3f6fb0", "#a0522d", "#4b7b4b"];
const colorOf = (dayNumber: number) => DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];

// Mapa da proposta: os pontos de cada dia pela ordem do roteiro, sobre o contorno da
// região. Mostra só o dia escolhido na navegação, ou todos.
export function ProposalMap({
  itinerary,
  dayFilter,
}: {
  itinerary: ItineraryDay[];
  dayFilter: number | "all";
}) {
  const [outlines, setOutlines] = useState<number[][][]>([]);
  useEffect(() => {
    const controller = new AbortController();
    portalFetch("/api/map-outlines", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((value: number[][][]) => setOutlines(Array.isArray(value) ? value : []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const { days, unplaced } = useMemo(() => proposalStops(itinerary), [itinerary]);
  const shown = days.filter((day) => dayFilter === "all" || day.dayNumber === dayFilter);
  const placed = shown.flatMap((day) => day.stops);
  const camera = fitPoints(placed.map((stop) => project(stop.longitude, stop.latitude)));
  // Unidades do mapa por píxel aproximado (o SVG ocupa ~640 px de largura).
  const pixel = camera.w / 640;
  const paths = useMemo(
    () =>
      outlines.map(
        (ring) =>
          ring.map(([lon, lat], i) => `${i ? "L" : "M"}${project(lon, lat).join(",")}`).join(" ") +
          " Z",
      ),
    [outlines],
  );
  const missing = unplaced.filter((stop) => dayFilter === "all" || stop.dayNumber === dayFilter);

  return (
    <div className="space-y-3 px-4 pb-4" data-testid="proposal-map-body">
      {placed.length ? (
        <div className="obs-map-canvas" style={{ aspectRatio: "3 / 2", height: "auto" }}>
          <svg
            viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
            role="img"
            aria-label="Mapa da proposta com os pontos de cada dia"
          >
            <rect x={-180} y={-180} width={360} height={360} fill="#edf2ee" />
            {paths.map((path, i) => (
              <path key={i} d={path} fill="#fdfcf7" stroke="#b1c5bc" strokeWidth={pixel} />
            ))}
            {shown.map((day) => {
              const points = day.stops.map((stop) => project(stop.longitude, stop.latitude));
              return (
                <g key={day.dayNumber}>
                  {points.length > 1 && (
                    <polyline
                      points={points.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={colorOf(day.dayNumber)}
                      strokeWidth={3 * pixel}
                      strokeLinejoin="round"
                      strokeDasharray={`${8 * pixel} ${5 * pixel}`}
                    />
                  )}
                  {day.stops.map((stop, i) => (
                    <g key={stop.id}>
                      <circle
                        cx={points[i][0]}
                        cy={points[i][1]}
                        r={11 * pixel}
                        fill={colorOf(day.dayNumber)}
                        stroke="#fff"
                        strokeWidth={2.5 * pixel}
                      >
                        <title>{`Dia ${day.dayNumber} · ${stop.order}. ${stop.title} (${stop.time})`}</title>
                      </circle>
                      <text
                        x={points[i][0]}
                        y={points[i][1] + 4 * pixel}
                        textAnchor="middle"
                        fontSize={11 * pixel}
                        fontWeight={700}
                        fill="#fff"
                        pointerEvents="none"
                      >
                        {stop.order}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
          <span className="obs-map-credit">Natural Earth · Domínio público</span>
        </div>
      ) : (
        <p className="text-sm text-[var(--portal-text-3a535b)]">
          <T text="Nenhum ponto desta seleção tem coordenadas no catálogo." source="pt" />
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        {shown.map((day) => (
          <div key={day.dayNumber}>
            <strong>
              <span aria-hidden="true" style={{ color: colorOf(day.dayNumber) }}>
                ●
              </span>{" "}
              <T text="Dia" source="pt" /> {day.dayNumber}
            </strong>
            {day.stops.length ? (
              <ol className="mt-1 space-y-0.5">
                {day.stops.map((stop) => (
                  <li key={stop.id}>
                    {stop.order}. {stop.title} <span className="opacity-70">· {stop.time}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 opacity-70">
                <T text="Sem pontos com coordenadas." source="pt" />
              </p>
            )}
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <div data-testid="proposal-map-unplaced" className="text-sm">
          <strong>
            <T text="Sem coordenadas no catálogo (não aparecem no mapa)" source="pt" />
          </strong>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((stop, i) => (
              <li key={`${stop.dayNumber}-${i}`}>
                <T text="Dia" source="pt" /> {stop.dayNumber}: {stop.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="obs-note">
        <T
          text="A linha liga os pontos pela ordem do roteiro; não é o trajeto na estrada. Coordenadas válidas não certificam a localização."
          source="pt"
        />
      </p>
    </div>
  );
}
