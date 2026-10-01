"use client";
import { selectStyle } from './ui/select-style';
import { T } from './LocaleProvider';
import { matchingOptions, matchingLabels, type MatchingProfile } from '@/lib/catalog-matching';

const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-[#9DB3B8] bg-white p-3 text-base';
export const profileFieldLabels = {
  minAge: 'Idade mínima (anos)', maxGroup: 'Máximo de participantes', pricePerPerson: 'Preço de referência por pessoa (EUR)',
  validFrom: 'Disponível a partir de', validUntil: 'Disponível até', verificationNotes: 'Fonte, data e condições verificadas',
};
export function CatalogCompatibility({ value, onChange, restaurant = false }: { value: MatchingProfile; onChange?: (value: MatchingProfile) => void; restaurant?: boolean }) {
  const update = (patch: Partial<MatchingProfile>) => onChange?.({ ...value, ...patch });
  return <section data-testid="catalog-compatibility" className="min-w-0 rounded-xl border border-[#C5D4D8] bg-[#F5F8F8] p-4 sm:p-5">
    <h3 className="text-lg font-semibold"><T text="Compatibilidade com o questionário" source="pt"/></h3>
    <p className="mt-2 text-sm leading-6"><T text="Associe os interesses para dar prioridade ao registo. Nas preferências de nível, ritmo e início, uma lista vazia não limita a seleção. Assinale exclusões que tornam este registo incompatível." source="pt"/></p>
    <p className="mt-2 text-sm leading-6"><T text="Mobilidade e alimentação: assinale apenas condições verificadas e documente a fonte. Sem correspondência para todas as restrições do cliente, o registo não é sugerido. Crianças por confirmar também impedem a seleção para famílias." source="pt"/></p>
    <div className="mt-4 space-y-3">
      {(Object.keys(matchingOptions) as (keyof typeof matchingOptions)[]).map(key => <details key={key} className="rounded-lg border border-[#C5D4D8] bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold"><T text={matchingLabels[key]} source="pt"/> ({value[key].length})</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{matchingOptions[key].map(option => <label key={option} className="flex min-w-0 items-start gap-3 text-sm leading-6">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#2D5B67]" disabled={!onChange} checked={value[key].includes(option)} onChange={e => update({ [key]: e.target.checked ? [...value[key], option] : value[key].filter(v => v !== option) })}/><span className="min-w-0 break-words"><T text={option} source="en"/></span>
        </label>)}</div>
      </details>)}
    </div>
    <fieldset disabled={!onChange} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="min-w-0 text-sm"><T text="Inclui comida ou bebida?" source="pt"/><select style={selectStyle} name="matching-food" className={inputClass} value={restaurant ? 'yes' : value.food} disabled={restaurant || !onChange} onChange={e => update({ food: e.target.value as MatchingProfile['food'] })}><option value="unknown"><T text="Por confirmar" source="pt"/></option><option value="yes"><T text="Sim" source="pt"/></option><option value="no"><T text="Não" source="pt"/></option></select></label>
      <label className="min-w-0 text-sm"><T text="Adequação a crianças" source="pt"/><select style={selectStyle} name="matching-children" className={inputClass} value={value.children} onChange={e => update({ children: e.target.value as MatchingProfile['children'] })}><option value="unknown"><T text="Por confirmar" source="pt"/></option><option value="allowed"><T text="Aceita crianças" source="pt"/></option><option value="adults_only"><T text="Apenas adultos" source="pt"/></option></select></label>
      {(['minAge', 'maxGroup', 'pricePerPerson'] as const).map(key => <label key={key} className="min-w-0 text-sm"><T text={profileFieldLabels[key]} source="pt"/><input className={inputClass} type="number" name={`matching-${key}`} min={key === 'maxGroup' ? 1 : 0} max={key === 'minAge' ? 120 : key === 'maxGroup' ? 200 : 1000000} step={key === 'pricePerPerson' ? '0.01' : '1'} value={value[key] ?? ''} onChange={e => update({ [key]: e.target.value === '' ? null : Number(e.target.value) })}/></label>)}
      {(['validFrom', 'validUntil'] as const).map(key => <label key={key} className="min-w-0 text-sm"><T text={profileFieldLabels[key]} source="pt"/><input className={inputClass} type="date" name={`matching-${key}`} value={value[key]} onChange={e => update({ [key]: e.target.value })}/></label>)}
      <label className="min-w-0 text-sm sm:col-span-2"><T text={profileFieldLabels.verificationNotes} source="pt"/><textarea className={inputClass} rows={3} maxLength={4000} name="matching-verificationNotes" value={value.verificationNotes} onChange={e => update({ verificationNotes: e.target.value })}/></label>
    </fieldset>
    <p className="mt-3 text-sm leading-6"><T text="O período limita os dias elegíveis; não confirma disponibilidade. O preço por pessoa é multiplicado pelo grupo e comparado com o orçamento restante. Preços em falta, transportes e alojamento continuam por orçamentar." source="pt"/></p>
    <p className="mt-2 text-sm leading-6"><T text="A idade mínima exige as idades das crianças no briefing, separadas por vírgulas. Notas livres, ocasiões especiais e preferências de alojamento requerem revisão do curador; este catálogo não inclui hotéis." source="pt"/></p>
    <p className="mt-2 text-sm leading-6"><T text="Preencha também o esforço físico nos dados do registo. Esforço por confirmar ou idade mínima acima dos 18 anos exigem revisão manual, porque o briefing não recolhe a idade dos adultos." source="pt"/></p>
  </section>;
}
