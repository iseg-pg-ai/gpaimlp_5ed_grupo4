import { renderPdf, type Snapshot, type VersionMeta } from "./itinerary-pdf.ts";
import { translateLocal } from "./local-translation.ts";
import type { Locale } from "./locales";
export async function renderLocalizedPdf(snapshot: Snapshot, meta: VersionMeta, locale: Locale) {
  const b = snapshot.brief;
  const english = [...new Set([b.pace, b.physicalEffort, b.morningPreference, ...b.interests, ...b.mobilityRestrictions, ...b.dietaryRestrictions, ...b.exclusions].filter(Boolean))].sort((a,b)=>b.length-a.length);
  const portuguese = await translateLocal(english.map(text=>({text,source:"en"})),"pt");
  const normalize = (text:string) => english.reduce((value,phrase,index)=>value.split(phrase).join(portuguese[index]),text);
  const capture: string[]=[];
  await renderPdf(snapshot,meta,{capture,normalize});
  const texts=[...new Set(capture)].filter(text=>text!==meta.filename&&!text.includes(meta.tripId)&&!text.includes(b.customerName)&&!/[a-f0-9]{64}/.test(text)&&!['Fonte:', 'Referência da reserva:', 'Contacto:', 'Fornecedor:'].some(prefix=>text.startsWith(prefix)));
  const values=await translateLocal(texts.map(text=>({text,source:"pt"})),locale);
  const translations=new Map(texts.map((text,i)=>[text,values[i]]));
  translations.set("BLU COSTA TRAVEL", "BLU COSTA TRAVEL");
  const titles = {pt:"ROTEIRO · PROPOSTA PRELIMINAR",en:"ITINERARY · PRELIMINARY PROPOSAL",es:"ITINERARIO · PROPUESTA PRELIMINAR",fr:"ITINÉRAIRE · PROPOSITION PRÉLIMINAIRE",de:"REISEPLAN · VORLÄUFIGER VORSCHLAG",zh:"行程 · 初步方案"};
  translations.set("ROTEIRO · PROPOSTA PRELIMINAR", titles[locale]);
  const partyLabels = {pt:["a","adultos","crianças"],en:["to","adults","children"],es:["a","adultos","niños"],fr:["au","adultes","enfants"],de:["bis","Erwachsene","Kinder"],zh:["至","成人","儿童"]}[locale];
  translations.set(`${b.startDate} a ${b.endDate} | ${b.proposalTier} | ${b.adults} adultos + ${b.children} crianças`, `${b.startDate} ${partyLabels[0]} ${b.endDate} | ${b.proposalTier} | ${b.adults} ${partyLabels[1]} + ${b.children} ${partyLabels[2]}`);
  const labels=["Versão", "Criada em", "Viagem", "SHA-256 do conteúdo", "SHA-256 da cadeia", "Fonte", "Referência da reserva", "Contacto", "Fornecedor"];
  const translatedLabels=await translateLocal(labels.map(text=>({text,source:"pt"})),locale);
  for(const text of capture) {
    if(!translations.has(text) && text!==meta.filename && !text.includes(b.customerName)) {
      translations.set(text, labels.reduce((value,label,index)=>value.replace(label,translatedLabels[index]),text));
    }
  }
  return renderPdf(snapshot,meta,{locale,normalize,translations});
}
