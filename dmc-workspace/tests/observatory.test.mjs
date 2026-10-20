import assert from "node:assert/strict";
import test from "node:test";
import { comparableMedian, display, hasCoordinates } from "../src/lib/observatory.ts";
const price = {
  category: "Atração",
  unit: "pessoa",
  rawUnit: "por pessoa",
  nature: "Público",
  currency: "EUR",
  reference: 0,
};
test("comparação preserva zero e recusa grupos com condições, natureza ou moeda diferentes", () => {
  assert.equal(display(0), "0");
  assert.equal(display(null), "Por confirmar");
  assert.equal(
    comparableMedian([price, { ...price, reference: null }, { ...price, reference: 10 }]),
    5,
  );
  for (const change of [
    { unit: null },
    { unit: "grupo" },
    { rawUnit: "por pessoa; reserva obrigatória" },
    { nature: "Custo" },
    { currency: "USD" },
    { category: "Experiência" },
  ])
    assert.equal(comparableMedian([price, { ...price, ...change }]), null);
  assert.equal(comparableMedian([{ ...price, reference: null }]), null);
});
test("mapa não converte ausências em coordenadas zero", () => {
  assert.equal(hasCoordinates({ latitude: null, longitude: 0 }), false);
  assert.equal(hasCoordinates({ latitude: "", longitude: 0 }), false);
  assert.equal(hasCoordinates({ latitude: 0, longitude: 0 }), true);
  assert.equal(hasCoordinates({ latitude: 91, longitude: 0 }), false);
  assert.equal(hasCoordinates({ latitude: "NaN", longitude: 0 }), false);
});
