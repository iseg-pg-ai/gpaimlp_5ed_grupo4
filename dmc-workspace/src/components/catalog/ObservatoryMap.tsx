// Agrupa e projeta os registos com localização, sem inventar coordenadas para os restantes.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Move } from "lucide-react";
import { display, hasCoordinates, type ObservatoryRecord } from "@/lib/observatory";
import { fitPoints, project } from "@/lib/map-projection";

const colors: Record<string, string> = {
  Atração: "#2d5b67",
  Restaurante: "#b57939",
  Experiência: "#75866a",
};
type Point = { key: string; members: ObservatoryRecord[]; x: number; y: number };
function destinations(members: ObservatoryRecord[]) {
  return [
    ...new Set(
      members
        .map((record) => record.destination ?? record.location)
        .filter((value): value is string => !!value),
    ),
  ];
}
function groupLabel(members: ObservatoryRecord[]) {
  const places = destinations(members);
  return places.length === 1
    ? `${places[0]} · ${members.length} ofertas`
    : `${members.length} ofertas · ${places.length ? `${places.length} destinos` : "destino por confirmar"}`;
}
export function ObservatoryMap({
  records,
  outlines,
  onSelect,
}: {
  records: ObservatoryRecord[];
  outlines: number[][][];
  onSelect: (keys: string[]) => void;
}) {
  const [layers, setLayers] = useState(Object.keys(colors));
  const [grouped, setGrouped] = useState(true);
  const [labels, setLabels] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const valid = useMemo(() => records.filter(hasCoordinates), [records]);
  const fit = () => fitPoints(valid.map((r) => project(Number(r.longitude), Number(r.latitude))));
  const [camera, setCamera] = useState(fit);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const paths = useMemo(
    () =>
      outlines.map(
        (ring) =>
          ring.map(([lon, lat], i) => `${i ? "L" : "M"}${project(lon, lat).join(",")}`).join(" ") +
          " Z",
      ),
    [outlines],
  );
  // Converter píxeis de ecrã em unidades do mapa mantém os alvos estáveis no zoom.
  const scale = Math.min(size.width / camera.w, size.height / camera.h);
  const pixel = 1 / scale;
  const offsetX = (size.width - camera.w * scale) / 2,
    offsetY = (size.height - camera.h * scale) / 2;
  const points: Point[] = [];
  for (const record of valid.filter((r) => layers.includes(r.kind))) {
    const [x, y] = project(Number(record.longitude), Number(record.latitude));
    const group = grouped
      ? points.find((p) => Math.hypot((p.x - x) * scale, (p.y - y) * scale) < 38)
      : undefined;
    if (group) {
      const n = group.members.length;
      group.x = (group.x * n + x) / (n + 1);
      group.y = (group.y * n + y) / (n + 1);
      group.members.push(record);
    } else points.push({ key: record.key, members: [record], x, y });
  }
  const activePoint = points.find((p) => p.key === active);
  const occupied: { left: number; top: number; width: number; height: number }[] = [];
  const annotations = labels
    ? points.flatMap((point) => {
        const raw =
          point.members.length > 1 ? groupLabel(point.members) : display(point.members[0].name);
        const text = raw.length > 30 ? raw.slice(0, 29) + "…" : raw;
        const sx = (point.x - camera.x) * scale + offsetX,
          sy = (point.y - camera.y) * scale + offsetY;
        const width = Math.min(size.width - 20, text.length * 6.7 + 12),
          height = 24,
          gap = point.members.length > 1 ? 19 : 14;
        const candidates = [
          { left: sx + gap, top: sy - height / 2 },
          { left: sx - width - gap, top: sy - height / 2 },
          { left: sx - width / 2, top: sy - height - gap },
          { left: sx - width / 2, top: sy + gap },
        ];
        const position = candidates.find(
          (p) =>
            p.left >= 8 &&
            p.top >= 8 &&
            p.left + width <= size.width - 55 &&
            p.top + height <= size.height - 28 &&
            !points.some((marker) => {
              if (marker.key === point.key) return false;
              const mx = (marker.x - camera.x) * scale + offsetX,
                my = (marker.y - camera.y) * scale + offsetY;
              const radius = marker.members.length > 1 ? 18 : 12;
              return (
                Math.hypot(
                  mx - Math.max(p.left, Math.min(mx, p.left + width)),
                  my - Math.max(p.top, Math.min(my, p.top + height)),
                ) <
                radius + 3
              );
            }) &&
            !occupied.some(
              (o) =>
                p.left < o.left + o.width + 8 &&
                p.left + width + 8 > o.left &&
                p.top < o.top + o.height + 6 &&
                p.top + height + 6 > o.top,
            ),
        );
        if (!position) return [];
        occupied.push({ ...position, width, height });
        return [
          {
            key: point.key,
            text,
            x: camera.x + (position.left - offsetX + 6) * pixel,
            y: camera.y + (position.top - offsetY + 16) * pixel,
          },
        ];
      })
    : [];
  const zoom = (factor: number) =>
    setCamera((c) => ({
      x: c.x + (c.w * (1 - factor)) / 2,
      y: c.y + (c.h * (1 - factor)) / 2,
      w: Math.max(0.02, Math.min(360, c.w * factor)),
      h: Math.max(0.02, Math.min(360, c.h * factor)),
    }));
  return (
    <div className="obs-map-panel">
      <div className="obs-map-controls">
        <div className="flex flex-wrap gap-3">
          {Object.entries(colors).map(([kind, color]) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={layers.includes(kind)}
                onChange={() =>
                  setLayers((v) => (v.includes(kind) ? v.filter((k) => k !== kind) : [...v, kind]))
                }
              />
              <span style={{ color }}>●</span> {kind}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <label>
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => {
                setGrouped(e.target.checked);
                setActive(null);
              }}
            />{" "}
            Agrupar próximos
          </label>
          <label>
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{" "}
            Mostrar nomes
          </label>
        </div>
      </div>
      <div ref={canvas} className="obs-map-canvas">
        <svg
          viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
          aria-label="Mapa interativo da oferta"
          role="group"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            setActive(null);
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            setCamera((c) => ({ ...c, x: c.x - dx * pixel, y: c.y - dy * pixel }));
            d.x = e.clientX;
            d.y = e.clientY;
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <rect x={-180} y={-180} width={360} height={360} fill="#edf2ee" />
          {paths.map((path, i) => (
            <path key={i} d={path} fill="#fdfcf7" stroke="#b1c5bc" strokeWidth={pixel} />
          ))}
          {points.map((point) => {
            const { members, x, y, key } = point;
            const name =
              members.length > 1
                ? groupLabel(members)
                : `${display(members[0].name)} · ${members[0].kind}`;
            const color = members.length > 1 ? "#143f4b" : colors[members[0].kind];
            return (
              <g
                key={key}
                className={active === key ? "obs-map-marker is-active" : "obs-map-marker"}
                onPointerEnter={() => setActive(key)}
                onPointerLeave={() => setActive(null)}
              >
                <circle
                  className="obs-map-hit"
                  cx={x}
                  cy={y}
                  r={22 * pixel}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={name}
                  onFocus={() => setActive(key)}
                  onBlur={() => setActive(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setActive(key);
                    onSelect(members.map((r) => r.key));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActive(key);
                      onSelect(members.map((r) => r.key));
                    }
                  }}
                >
                  <title>{name}</title>
                </circle>
                <circle
                  className="obs-map-dot"
                  cx={x}
                  cy={y}
                  r={(members.length > 1 ? 15 : 9) * pixel}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={2.5 * pixel}
                  pointerEvents="none"
                />
                {members.length > 1 && (
                  <text
                    x={x}
                    y={y + 4 * pixel}
                    textAnchor="middle"
                    fontSize={12 * pixel}
                    fontWeight={700}
                    fill="#fff"
                    pointerEvents="none"
                  >
                    {members.length}
                  </text>
                )}
              </g>
            );
          })}
          {annotations.map((label) => (
            <text
              key={label.key}
              className="obs-map-label"
              x={label.x}
              y={label.y}
              fontSize={12 * pixel}
              fontWeight={500}
              fill="#143f4b"
              stroke="#fffefa"
              strokeWidth={4 * pixel}
              paintOrder="stroke"
              strokeLinejoin="round"
              pointerEvents="none"
            >
              {label.text}
            </text>
          ))}
        </svg>
        <div className="obs-map-buttons">
          <button type="button" aria-label="Aproximar mapa" onClick={() => zoom(0.7)}>
            <Plus />
          </button>
          <button type="button" aria-label="Afastar mapa" onClick={() => zoom(1.4)}>
            <Minus />
          </button>
          <button type="button" aria-label="Repor mapa" onClick={() => setCamera(fit())}>
            <RotateCcw />
          </button>
        </div>
        {activePoint && (
          <div className="obs-map-tooltip" role="status">
            <strong>
              {activePoint.members.length > 1
                ? `${activePoint.members.length} ofertas nesta zona`
                : display(activePoint.members[0].name)}
            </strong>
            <span>
              {[...new Set(activePoint.members.map((r) => r.kind))].join(" · ")} /{" "}
              {destinations(activePoint.members).join(" / ") || "Destino por confirmar"}
            </span>
            <small>
              {activePoint.members.length > 1
                ? "Selecione para escolher uma oferta do grupo."
                : "Selecione para abrir a ficha completa."}
            </small>
          </div>
        )}
        {!points.length && (
          <p className="obs-map-empty">Sem coordenadas válidas nas camadas selecionadas.</p>
        )}
        <span className="obs-map-credit">Natural Earth · Domínio público</span>
      </div>
      <div className="obs-map-footer">
        <Move aria-hidden="true" className="size-3.5" /> Arraste para mover · {valid.length}/
        {records.length} com coordenadas
      </div>
      <p className="obs-note">
        O zoom separa os grupos visuais. Coordenadas válidas não certificam a localização.
      </p>
    </div>
  );
}
