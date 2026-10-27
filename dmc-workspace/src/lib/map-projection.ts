// Projeção Mercator partilhada pelos mapas do portal (Observatório e proposta):
// longitude e latitude em graus para coordenadas SVG, com o norte para cima.
export function project(lon: number, lat: number): [number, number] {
  return [
    lon,
    (-Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * 180) /
      Math.PI,
  ];
}

export type Camera = { x: number; y: number; w: number; h: number };

/** Enquadramento que mostra todos os pontos com margem; sem pontos, Portugal continental. */
export function fitPoints(points: [number, number][]): Camera {
  if (!points.length) return { x: -12, y: -52, w: 17, h: 14 };
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const w = Math.max(3, Math.max(...xs) - Math.min(...xs) + 1.2),
    h = Math.max(w * 0.7, Math.max(...ys) - Math.min(...ys) + 1.2);
  return {
    x: (Math.max(...xs) + Math.min(...xs)) / 2 - w / 2,
    y: (Math.max(...ys) + Math.min(...ys)) / 2 - h / 2,
    w,
    h,
  };
}
