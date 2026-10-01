"use client";
import { useEffect, useRef, useState } from 'react';
import { T } from '@/components/LocaleProvider';
import { CatalogCompatibility } from '@/components/CatalogCompatibility';
import { emptyMatching } from '@/lib/catalog-matching';
import { selectStyle } from '@/components/ui/select-style';
import { Button } from '@/components/ui/button';
import { categories, categoryLabels, statuses, statusLabels, fieldLabels, emptyFields, type Category, type CatalogRecord, type CatalogInput, type Fields } from '@/lib/catalog-schema';

type Entry = CatalogRecord & { published?: boolean };
const control = 'w-full min-w-0 rounded-lg border border-[#9DB3B8] bg-white p-3 text-base text-[#143F4B]';
const button = 'min-h-11 rounded-lg border border-[#9DB3B8] px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-[#EDF3F4]';
const statusColor = { draft: 'bg-stone-100', review: 'bg-amber-50', approved: 'bg-teal-50', inactive: 'bg-gray-100 text-gray-600' };
async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Pedido falhou.');
  return data;
}
export default function CatalogPage() {
  const [records, setRecords] = useState<Entry[]>([]);
  const [category, setCategory] = useState<Category>('atracoes');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [editing, setEditing] = useState<CatalogInput | null>(null);
  const [history, setHistory] = useState<CatalogRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const editorRef = useRef<HTMLFormElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  async function load() { const data = await responseJson(await fetch('/api/catalog', { cache: 'no-store' })); setRecords(data); }
  useEffect(() => {
    let active = true;
    fetch('/api/catalog', { cache: 'no-store' }).then(responseJson).then(data => { if (active) setRecords(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const editorKey = editing ? `${editing.category}:${editing.id ?? 'new'}` : '';
  useEffect(() => { if (editorKey) { editorRef.current?.scrollIntoView({ block: 'start' }); editorRef.current?.querySelector('input')?.focus(); } }, [editorKey]);
  const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = records.filter(r => r.category === category && (!status || r.status === status) && (!location || r.fields.location === location) && norm([r.fields.name, r.fields.location, r.fields.description, r.fields.provider, r.id].join(' ')).includes(norm(query))).sort((a,b) => a.fields.name.localeCompare(b.fields.name));
  const locations = [...new Set(records.filter(r => r.category === category).map(r => r.fields.location).filter(Boolean))].sort();
  function edit(record?: Entry) {
    setHistory(null); setError(''); setNotice('');
    setEditing(record ? { id: record.id, category: record.category, status: record.status, baseRevision: record.revision, fields: { ...record.fields }, matching: record.matching ?? emptyMatching(), reason: '' } : { category, status: 'draft', baseRevision: null, fields: emptyFields(), matching: emptyMatching(), reason: 'Criação de registo' });
  }
  async function save(input: CatalogInput) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      // Preserve the draft on conflict, but refresh the list so reopening uses the current revision.
      if (response.status === 409) await load();
      await responseJson(response);
      setEditing(null); setHistory(null);
      setNotice('Registo guardado. Atualize o catálogo para disponibilizar a revisão aprovada nos novos roteiros.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
    finally { setBusy(false); }
  }
  async function showHistory(record: Entry) {
    setBusy(true); setError('');
    try { setHistory(await responseJson(await fetch(`/api/catalog?id=${encodeURIComponent(record.id)}`))); requestAnimationFrame(() => historyRef.current?.scrollIntoView({ block: 'start' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível ler o histórico.'); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setError(''); setNotice('');
    try { await responseJson(await fetch('/api/catalog/publish', { method: 'POST' })); await load(); setNotice('Catálogo atualizado. Apenas as revisões aprovadas ficam disponíveis para novos roteiros.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar.'); }
    finally { setBusy(false); }
  }
  const fields = (Object.keys(fieldLabels) as (keyof Fields)[]).filter(key => {
    if (['cuisine', 'dietary'].includes(key)) return editing?.category === 'restaurantes';
    if (['provider', 'modality'].includes(key)) return editing?.category === 'experiencias';
    if (key === 'kind') return editing?.category !== 'restaurantes';
    return true;
  });
  return <main className="mx-auto max-w-6xl p-4 sm:p-8 text-[#143F4B]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-serif-blu text-3xl"><T text="Catálogo" source="pt"/></h1>
        <p className="mt-3 max-w-2xl text-sm leading-6"><T text="Mantenha a oferta e reveja os dados antes de aprovar. Apenas os aprovados entram em novos roteiros após atualizar o catálogo." source="pt"/></p></div>
      <button className={button} disabled={busy || loading} onClick={publish}><T text="Atualizar catálogo para os roteiros" source="pt"/></button>
    </div>
    {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-4 text-red-900"><T text={error} source="pt"/></p>}
    {notice && <p role="status" className="my-4 rounded-lg bg-teal-50 p-4"><T text={notice} source="pt"/></p>}
    {busy && <p role="status" className="my-4"><T text="A processar…" source="pt"/></p>}
    <div role="tablist" className="my-6 flex flex-wrap gap-2">
      {categories.map(c => <button key={c} id={`tab-${c}`} role="tab" aria-selected={category === c} aria-controls="catalog-panel" disabled={busy || Boolean(editing)} onClick={() => { setCategory(c); setLocation(''); setHistory(null); }} className={`${button} ${category === c ? 'bg-[#143F4B] text-white hover:bg-[#205562]' : 'bg-white'}`}><T text={categoryLabels[c]} source="pt"/></button>)}
    </div>
    <section id="catalog-panel" role="tabpanel" aria-labelledby={`tab-${category}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm"><T text="Pesquisar" source="pt"/><input data-testid="catalog-search" className={`${control} mt-1`} value={query} onChange={e => setQuery(e.target.value)}/></label>
        <label className="text-sm"><T text="Estado" source="pt"/><select style={selectStyle} className={`${control} mt-1`} value={status} onChange={e => setStatus(e.target.value)}><option value=""><T text="Todos os estados" source="pt"/></option>{statuses.map(s => <option key={s} value={s}><T text={statusLabels[s]} source="pt"/></option>)}</select></label>
        <label className="text-sm"><T text="Localização" source="pt"/><select style={selectStyle} className={`${control} mt-1`} value={location} onChange={e => setLocation(e.target.value)}><option value=""><T text="Todas as localizações" source="pt"/></option>{locations.map(l => <option key={l}>{l}</option>)}</select></label>
        <Button className="h-auto min-h-[50px] w-full self-end whitespace-normal border border-transparent p-3 text-base" disabled={busy || loading || Boolean(editing)} onClick={() => edit()}><span>+</span><T text="Novo Registo" source="pt"/></Button>
      </div>
      {editing && <form ref={editorRef} data-testid="catalog-editor" className="my-6 scroll-mt-4 rounded-2xl border border-[#9DB3B8] bg-white p-4 sm:p-6" onSubmit={e => { e.preventDefault(); save(editing); }}>
        <h2 className="text-xl font-semibold"><T text={editing.id ? 'Editar registo' : 'Novo registo'} source="pt"/> · <T text={categoryLabels[editing.category]} source="pt"/></h2>
        <p className="my-3 text-sm leading-6"><T text="Para aprovar: nome, localização, descrição, duração, preço, fonte, acessibilidade e esforço são obrigatórios. Use preços de referência com unidade; a aprovação não confirma reservas." source="pt"/></p>
        <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2">
          {fields.map(key => <label key={key} className={`min-w-0 text-sm ${key === 'description' ? 'md:col-span-2' : ''}`}><T text={fieldLabels[key]} source="pt"/>
            {key === 'effort' ? <select style={selectStyle} className={`${control} mt-1`} name={key} value={editing.fields[key]} onChange={e => setEditing({ ...editing, fields: { ...editing.fields, [key]: e.target.value } })}>{[...new Set(['', 'Baixo', 'Moderado', 'Alto', 'Por confirmar', editing.fields[key]])].map(v => <option key={v} value={v}>{v ? <T text={v} source="pt"/> : '—'}</option>)}</select>
              : ['description', 'accessibility', 'dietary'].includes(key) ? <textarea rows={3} maxLength={4000} name={key} className={`${control} mt-1`} value={editing.fields[key]} onChange={e => setEditing({ ...editing, fields: { ...editing.fields, [key]: e.target.value } })}/>
              : <input name={key} required={key === 'name'} maxLength={key === 'name' ? 200 : 4000} className={`${control} mt-1`} value={editing.fields[key]} onChange={e => setEditing({ ...editing, fields: { ...editing.fields, [key]: e.target.value } })}/>}
          </label>)}
          <div className="md:col-span-2 min-w-0"><CatalogCompatibility value={editing.matching ?? emptyMatching()} restaurant={editing.category === 'restaurantes'} onChange={matching => setEditing({ ...editing, matching })}/></div>
          <label className="text-sm"><T text="Estado" source="pt"/><select style={selectStyle} name="status" className={`${control} mt-1`} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as CatalogInput['status'] })}>{statuses.map(s => <option key={s} value={s}><T text={statusLabels[s]} source="pt"/></option>)}</select></label>
          <label className="text-sm"><T text="Motivo da alteração" source="pt"/><input name="reason" required maxLength={500} className={`${control} mt-1`} value={editing.reason} onChange={e => setEditing({ ...editing, reason: e.target.value })}/></label>
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} className={`${button} bg-[#143F4B] text-white hover:bg-[#205562]`} type="submit"><T text="Guardar registo" source="pt"/></button><button className={button} disabled={busy} type="button" onClick={() => setEditing(null)}><T text="Cancelar" source="pt"/></button></div>
      </form>}
      {history && <section ref={historyRef} data-testid="catalog-history" className="my-6 rounded-2xl border bg-white p-4 sm:p-6">
        <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl"><T text="Histórico de alterações" source="pt"/></h2><button className={button} onClick={() => setHistory(null)}><T text="Fechar" source="pt"/></button></div>
        <ol className="mt-4 space-y-4">{history.map(h => <li key={h.revision} className="border-t pt-4"><p className="break-words font-semibold">{h.fields.name} · v{h.revision} · <T text={statusLabels[h.status]} source="pt"/></p><p className="my-2 text-sm">{new Date(h.updatedAt).toLocaleString()} · {h.reason}</p><p className="break-all text-xs">{h.id}</p><details className="mt-2 text-sm"><summary className="cursor-pointer py-2"><T text="Ver dados desta revisão" source="pt"/></summary><dl className="grid gap-3 sm:grid-cols-2">{Object.entries(h.fields).filter(([,v]) => v).map(([k,v]) => <div className="min-w-0" key={k}><dt className="font-semibold"><T text={fieldLabels[k as keyof Fields]} source="pt"/></dt><dd className="break-words whitespace-pre-wrap">{v}</dd></div>)}</dl>{h.matching && <div className="mt-4"><CatalogCompatibility value={h.matching} restaurant={h.category === 'restaurantes'}/></div>}</details></li>)}</ol>
      </section>}
      <p role="status" className="my-5 text-sm">{loading ? <T text="A carregar catálogo…" source="pt"/> : <>{filtered.length} <T text="registos" source="pt"/></>}</p>
      {!loading && !filtered.length && <p className="rounded-xl border bg-white p-6"><T text="Sem registos para estes filtros." source="pt"/></p>}
      <div className="grid gap-4 lg:grid-cols-2">{filtered.map(r => <article key={r.id} data-testid="catalog-record" className="min-w-0 rounded-2xl border border-[#D5D1C7] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{r.fields.name}</h2><span className={`rounded-full px-3 py-1 text-sm ${statusColor[r.status]}`}><T text={statusLabels[r.status]} source="pt"/></span></div>
        <p className="my-2 break-words text-sm">{r.fields.location || '—'} · {r.fields.duration || '—'}</p><p className="break-words text-sm leading-6">{r.fields.description}</p>
        <p className="mt-3 text-sm">{r.fields.price || '—'}</p>
        <p className="mt-3 text-sm font-medium"><T text={r.published ? 'Disponível para novos roteiros' : r.status === 'approved' ? 'Aguarda atualização do catálogo' : 'Fora da geração de roteiros'} source="pt"/></p>
        <p className="mt-2 break-all text-xs text-[#4A636B]">{r.id} · v{r.revision}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={busy || Boolean(editing)} onClick={() => edit(r)}><T text="Editar" source="pt"/></button><button className={button} disabled={busy} onClick={() => showHistory(r)}><T text="Histórico" source="pt"/></button>{r.status !== 'inactive' && <button className={button} disabled={busy || Boolean(editing)} onClick={() => save({ id: r.id, category: r.category, status: 'inactive', fields: r.fields, matching: r.matching, baseRevision: r.revision, reason: 'Inativação manual no portal' })}><T text="Inativar" source="pt"/></button>}</div>
      </article>)}</div>
    </section>
  </main>;
}
