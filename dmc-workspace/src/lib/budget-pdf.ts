import { proposalBudget } from "./proposal-budget.ts";
import type { PdfLanguageOptions, Snapshot, VersionMeta } from "./itinerary-pdf";

export function renderBudget(
  doc: PDFKit.PDFDocument,
  snapshot: Snapshot,
  meta: VersionMeta,
  options: PdfLanguageOptions,
) {
  const budget = proposalBudget(snapshot);
  const tr = (text: string) => {
    const value = options.normalize?.(text) ?? text;
    options.capture?.push(value);
    return options.translations?.get(value) ?? value;
  };
  const money = (cents: number | null, currency: string | null) =>
    cents === null ? "Por confirmar" : `${(cents / 100).toFixed(2)} ${currency}`;
  const text = (value: string, size = 10) => {
    doc
      .fontSize(size)
      .fillColor("#143F4B")
      .text(tr(value), 48, doc.y, { width: doc.page.width - 96, lineGap: 4 });
    doc.moveDown(0.6);
  };
  const widths = [175, 52, 87, 87, doc.page.width - 96 - 401];
  const row = (values: string[], header = false) => {
    const cells = values.map(tr);
    doc.fontSize(9);
    const height =
      Math.max(
        ...cells.map((value, i) =>
          doc.heightOfString(value, { width: widths[i] - 12, lineGap: 3 }),
        ),
      ) + 18;
    const top = doc.y;
    doc
      .save()
      .rect(48, top, doc.page.width - 96, height)
      .fill(header ? "#143F4B" : "#F4F0E7")
      .restore();
    let x = 48;
    cells.forEach((cell, i) => {
      doc
        .fontSize(9)
        .fillColor(header ? "#FFFFFF" : "#143F4B")
        .text(cell, x + 6, top + 8, { width: widths[i] - 12, lineGap: 3 });
      x += widths[i];
    });
    doc.y = top + height + 3;
    doc.x = 48;
  };
  const newPage = () => {
    doc.addPage();
    text("Orçamento da proposta", 22);
    text(
      `${snapshot.brief.customerName} · ${snapshot.brief.destination} · v${String(meta.version).padStart(3, "0")}`,
    );
    text("Documento de proposta; não é uma fatura. Disponibilidade e condições por confirmar.");
    row(["Descrição", "Qtd. / unidade", "Preço unitário", "Subtotal", "Estado"], true);
  };
  newPage();
  for (const line of budget.lines) {
    // Full activity names remain in the itinerary; keep invoice rows bounded on translated pages.
    const description =
      line.description.length > 150 ? line.description.slice(0, 147) + "…" : line.description;
    const values = [
      description,
      line.quantity === null
        ? "Por confirmar"
        : `${line.quantity} ${line.unit}${line.quantity !== 1 ? "s" : ""}`,
      money(line.unitCents, line.currency),
      money(line.subtotalCents, line.currency),
      line.status,
    ];
    const required =
      Math.max(
        ...values.map((value, i) =>
          doc
            .fontSize(9)
            .heightOfString(
              options.translations?.get(options.normalize?.(value) ?? value) ??
                options.normalize?.(value) ??
                value,
              { width: widths[i] - 12, lineGap: 3 },
            ),
        ),
      ) + 21;
    if (doc.y + required > doc.page.height - 70) newPage();
    row(values);
  }
  if (doc.y > doc.page.height - 240) doc.addPage();
  doc.moveDown();
  text(
    budget.incomplete
      ? "Subtotal conhecido — proposta incompleta"
      : "Total dos serviços discriminados",
    15,
  );
  if (!Object.keys(budget.totals).length)
    text("Por confirmar — ainda não existem valores calculáveis.");
  for (const [currency, total] of Object.entries(budget.totals)) {
    text(money(total.confirmed + total.estimated, currency), 14);
    if (budget.lines.some((line) => line.currency === currency && line.status === "Confirmado"))
      text(`Confirmado: ${money(total.confirmed, currency)}`);
    if (budget.lines.some((line) => line.currency === currency && line.status === "Estimativa"))
      text(`Estimativa: ${money(total.estimated, currency)}`);
  }
  text(
    "Valores por confirmar não são zero e não entram na soma. Moedas diferentes não são convertidas nem somadas entre si.",
  );
  text(
    `Orçamento disponível do cliente: ${snapshot.brief.budget.toFixed(2)} ${snapshot.brief.currency}. Este limite não representa o custo da proposta.`,
  );
  text(
    "Quantidades por pessoa consideram adultos e crianças ao mesmo preço de referência. Tarifas diferenciadas e horas faturáveis requerem confirmação.",
  );
  text("Inclusões, exclusões e impostos ou taxas", 14);
  text(
    "A soma abrange apenas as linhas com preço e quantidade conhecidos. Alojamento, transporte e outros serviços só estão incluídos se discriminados. Não se presume que impostos ou taxas estejam incluídos.",
  );
  for (const term of budget.terms)
    if (term.inclusions || term.exclusions || term.taxes) {
      text(term.description, 11);
      if (term.inclusions) text(`Inclusões: ${term.inclusions}`);
      if (term.exclusions) text(`Exclusões: ${term.exclusions}`);
      if (term.taxes) text(`Impostos / taxas: ${term.taxes}`);
    }
  text(
    "Condições não indicadas: por confirmar. Taxas não são calculadas nem adicionadas sem valores e regras explícitos.",
  );
}
