// Renderiza a entrega PDF a partir do snapshot e das fontes configuradas, incluindo suporte
// CJK.
import { activitySource, dayDescription, presentationText } from "./presentation-text.ts";
import { outstandingChecks } from "./activity-confirmation.ts";
import { renderBudget } from "./budget-pdf.ts";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import type { CustomerBrief, ItineraryDay } from "../types/index";
export type Snapshot = { brief: CustomerBrief; itinerary: ItineraryDay[]; pending: string[] };
export type VersionMeta = {
  exportedAt?: string | null;
  tripId: string;
  version: number;
  filename: string;
  createdAt: string;
  reason: string;
  snapshotHash: string;
  chainHash: string;
  parentVersion: number | null;
};
export type PdfLanguageOptions = {
  locale?: string;
  capture?: string[];
  normalize?: (text: string) => string;
  translations?: Map<string, string>;
};
// Exigir a fonte compatível antes de tentar renderizar caracteres CJK.
export function resolveChineseFont() {
  const configured = process.env.BLU_PDF_CJK_FONT;
  const candidates = configured
    ? [{ path: configured, face: process.env.BLU_PDF_CJK_FACE ?? "MicrosoftYaHei" }]
    : [
        { path: "C:/Windows/Fonts/msyh.ttc", face: "MicrosoftYaHei" },
        { path: "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", face: "WenQuanYiZenHei" },
        {
          path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
          face: "NotoSansCJKsc-Regular",
        },
      ];
  return candidates.find((font) => existsSync(/* turbopackIgnore: true */ font.path));
}

export function renderPdf(
  snapshot: Snapshot,
  meta: VersionMeta,
  options: PdfLanguageOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 64, bottom: 64, left: 48, right: 48 },
      bufferPages: true,
      info: {
        Title: `${snapshot.brief.customerName} — ${snapshot.brief.destination} — v${meta.version}`,
        Author: "BLU Costa Travel",
        CreationDate: new Date(meta.createdAt),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      const font = [
        process.env.BLU_PDF_FONT,
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
      ].find((p) => p && existsSync(p));
      if (options.locale === "zh") {
        const chineseFont = resolveChineseFont();
        if (!chineseFont) throw new Error("Configure BLU_PDF_CJK_FONT with a Chinese font.");
        if (chineseFont.path.endsWith(".ttc")) doc.font(chineseFont.path, chineseFont.face);
        else doc.font(chineseFont.path);
      } else if (font) doc.font(font);
      const decorate = () => {
        doc.save();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFEFA");
        doc.rect(0, 0, doc.page.width, 10).fill("#143F4B");
        doc.rect(48, 35, 38, 3).fill("#B88B49");
        doc.restore();
      };
      decorate();
      doc.on("pageAdded", decorate);
      const translated = (value: string) => {
        const clean = presentationText(value);
        const normalized = options.normalize?.(clean) ?? clean;
        return presentationText(options.translations?.get(normalized) ?? normalized);
      };
      const ensure = (height: number) => {
        if (doc.y + height > doc.page.height - 64) doc.addPage();
      };
      const text = (value: string, size = 11, color = "#143F4B") => {
        value = presentationText(value);
        value = options.normalize?.(value) ?? value;
        if (!value.trim()) return;
        options.capture?.push(value);
        value = presentationText(options.translations?.get(value) ?? value);
        doc
          .fontSize(size)
          .fillColor(color)
          .text(value, 48, doc.y, { width: doc.page.width - 96, lineGap: 5 });
        doc.moveDown(0.45);
      };
      const heading = (value: string) => {
        const height = doc
          .fontSize(23)
          .heightOfString(translated(value), { width: doc.page.width - 96, lineGap: 5 });
        ensure(Math.min(height + 65, 600));
        doc.save().rect(48, doc.y, 32, 3).fill("#B88B49").restore();
        doc.y += 16;
        text(value, 23);
      };
      const b = snapshot.brief;
      // The cover uses the same flow layout in every language, rather than fixed text boxes.
      doc.save();
      doc.rect(0, 0, doc.page.width, 170).fill("#143F4B");
      doc
        .circle(doc.page.width - 15, 40, 115)
        .lineWidth(1)
        .stroke("#50727A");
      doc.circle(doc.page.width - 15, 40, 145).stroke("#50727A");
      doc.restore();
      doc.y = 64;
      text("BLU COSTA TRAVEL", 27, "#FFFEFA");
      doc.y = 204;
      text("ROTEIRO · PROPOSTA PRELIMINAR", 11, "#896225");
      text(b.destination, 38);
      text(b.customerName, 22, "#52656B");
      doc.moveDown(0.6);
      text(
        `${b.startDate} a ${b.endDate} | ${b.proposalTier} | ${b.adults} adultos + ${b.children} crianças`,
        12,
      );
      text(`Versão v${String(meta.version).padStart(3, "0")}`, 14, "#896225");
      text(
        "Proposta para revisão. As reservas e os preços dependem de confirmação.",
        11,
        "#52656B",
      );
      doc.addPage();
      heading("A sua viagem");
      text(`${b.customerName} — ${b.destination}`, 15);
      text(
        `Versão v${String(meta.version).padStart(3, "0")} | Criada em ${new Date(meta.createdAt).toLocaleDateString("pt-PT", { timeZone: "UTC" })}`,
        9,
        "#52656B",
      );
      text(`Orçamento indicado: ${b.budget} ${b.currency}. Limite do cliente; não é uma cotação.`);
      text(
        `Chegada: ${b.arrivalLocation || "Por confirmar"} | Hora: ${b.arrivalTime || "Por confirmar"} | Voo: ${b.arrivalFlightNumber || "Por confirmar"}`,
      );
      text(
        `Partida: ${b.departureLocation || "Por confirmar"} | Hora: ${b.departureTime || "Por confirmar"} | Voo: ${b.departureFlightNumber || "Por confirmar"}`,
      );
      text(`Ritmo: ${b.pace}; esforço: ${b.physicalEffort}; início: ${b.morningPreference}`);
      text(`Interesses: ${b.interests.join(", ") || "Não indicados"}`);
      text(`Mobilidade: ${b.mobilityRestrictions.join(", ") || "Não indicada"}`);
      text(`Restrições alimentares: ${b.dietaryRestrictions.join(", ") || "Não indicadas"}`);
      text(`Exclusões: ${b.exclusions.join(", ") || "Não indicadas"}`);
      heading("Confirmações pendentes");
      for (const pending of snapshot.pending) text(`• ${presentationText(pending)}`, 10, "#805D26");
      for (const day of snapshot.itinerary) {
        doc.addPage();
        heading(`Dia ${day.dayNumber} · ${day.date} · ${day.title}`);
        text(day.location);
        if (dayDescription(day.summary)) text(dayDescription(day.summary));
        if (!day.items.length) text("Sem atividades selecionadas. Requer curadoria manual.");
        for (const item of day.items) {
          const titleHeight = doc
            .fontSize(18)
            .heightOfString(translated(item.title), { width: doc.page.width - 96, lineGap: 5 });
          ensure(Math.min(titleHeight + 120, 600));
          doc
            .save()
            .moveTo(48, doc.y)
            .lineTo(doc.page.width - 48, doc.y)
            .lineWidth(0.7)
            .stroke("#DDD8CE")
            .restore();
          doc.y += 15;
          text(item.time, 10, "#896225");
          text(item.title, 18);
          if (item.isLocked) text("Protegida", 10, "#52656B");
          if (item.location) text(item.location, 11, "#52656B");
          if (item.duration) text(`Duração: ${item.duration}`);
          if (item.description) {
            doc.moveDown(0.2);
            text(item.description);
          }
          if (item.priceNote) text(item.priceNote, 10, "#805D26");
          if (item.dietaryNotes) text(item.dietaryNotes);
          if (item.accessibilityNotes) text(item.accessibilityNotes);
          const remaining = outstandingChecks(item);
          if (remaining.length) text(`Por confirmar: ${remaining.join("; ")}`, 10, "#805D26");
          if (item.confirmation) {
            const c = item.confirmation;
            text(c.status === "confirmed" ? "Confirmada pelo curador" : "Confirmação em curso");
            if (c.price)
              text(
                `${c.status === "confirmed" ? "Preço acordado" : "Preço registado"}: ${c.price}`,
              );
            if (c.supplier) text(`Fornecedor: ${c.supplier}`);
            if (c.reference) text(`Referência da reserva: ${c.reference}`);
            if (c.contact) text(`Contacto: ${c.contact}`);
            if (c.notes) text(`Evidência / condições: ${c.notes}`);
            if (c.confirmedAt) text(`Confirmada em: ${c.confirmedAt}`);
            for (const check of c.checks)
              if (check.details)
                text(
                  `${check.resolved ? "Resolvida" : "Pendente"} — ${check.label}: ${check.details}`,
                );
          }
          const source = activitySource(item.source);
          if (source) text(`Fonte: ${source}`, 8, "#52656B");
          if (item.transitToNext)
            text(
              `Deslocação: ${item.transitToNext.fromLocation} → ${item.transitToNext.toLocation}; ${item.transitToNext.mode}; ${item.transitToNext.duration}. Confirmar condições.`,
            );
          doc.moveDown();
        }
      }
      renderBudget(doc, snapshot, meta, options);
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc
          .save()
          .moveTo(48, doc.page.height - 46)
          .lineTo(doc.page.width - 48, doc.page.height - 46)
          .lineWidth(0.5)
          .stroke("#DDD8CE")
          .restore();
        doc
          .fontSize(8)
          .fillColor("#52656B")
          .text(
            `BLU · v${String(meta.version).padStart(3, "0")} | ${i + 1} / ${range.count}`,
            48,
            doc.page.height - 30,
            { lineBreak: false },
          );
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
