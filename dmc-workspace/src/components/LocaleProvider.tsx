"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { languages, isLocale, type Locale } from "@/lib/locales";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import catalogue from "@/i18n/messages.json";
const messages = catalogue as Record<string, Partial<Record<Locale,string>>>;
type Context = { locale: Locale; setLocale: (locale: Locale) => void; values: Record<string,string>; request: (text:string,source:"pt"|"en")=>void };
const LocaleContext=createContext<Context | null>(null);
export function Flag({code}:{code:string}) {
  return <svg viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" className="shrink-0 border border-black/10">
    {code==="FR" ? <><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#002395" d="M0 0h10v20H0z"/><path fill="#ed2939" d="M20 0h10v20H20z"/></> :
    code==="DE" ? <><path fill="#000" d="M0 0h30v7H0z"/><path fill="#dd0000" d="M0 7h30v7H0z"/><path fill="#ffce00" d="M0 14h30v6H0z"/></> :
    code==="ES" ? <><path fill="#aa151b" d="M0 0h30v20H0z"/><path fill="#f1bf00" d="M0 5h30v10H0z"/><path fill="#aa151b" d="M7 8h3v5H7z"/></> :
    code==="PT" ? <><path fill="#f00" d="M0 0h30v20H0z"/><path fill="#006600" d="M0 0h12v20H0z"/><circle cx="12" cy="10" r="5" fill="#ff0"/><path fill="#fff" stroke="#d00" strokeWidth="1.5" d="M9 7h6v5l-3 2-3-2z"/></> :
    code==="CN" ? <><path fill="#de2910" d="M0 0h30v20H0z"/><text x="2" y="10" fill="#ffde00" fontSize="10">★</text><text x="10" y="5" fill="#ffde00" fontSize="4">★</text><text x="13" y="8" fill="#ffde00" fontSize="4">★</text><text x="13" y="12" fill="#ffde00" fontSize="4">★</text><text x="10" y="15" fill="#ffde00" fontSize="4">★</text></> :
    <><path fill="#012169" d="M0 0h30v20H0z"/><path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20"/><path stroke="#c8102e" strokeWidth="2" d="m0 0 30 20M30 0 0 20"/><path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30"/><path stroke="#c8102e" strokeWidth="4" d="M15 0v20M0 10h30"/></>}
  </svg>;
}
export function LanguagePicker({value,onChange}:{value:Locale;onChange:(locale:Locale)=>void}) {
  const selected=languages.find(l=>l.code===value)!;
  return <details className="relative inline-block"><summary className="cursor-pointer flex items-center gap-2 rounded border bg-white p-2 text-sm"><Flag code={selected.flag}/>{selected.name} ▾</summary>
    <div className="absolute right-0 z-[100] bg-white border rounded shadow-lg min-w-48 p-1">{languages.map(l=><button type="button" key={l.code} onClick={e=>{onChange(l.code); e.currentTarget.closest("details")?.removeAttribute("open");}} className="flex w-full items-center gap-2 p-2 hover:bg-stone-100 text-left"><Flag code={l.flag}/>{l.name}</button>)}</div>
  </details>;
}
export function LocaleProvider({children}:{children:React.ReactNode}) {
  const [locale,setLocaleState]=useState<Locale>("pt");
  const [values,setValues]=useState<Record<string,string>>({});
  const [error,setError]=useState(false);
  const pending=useRef(new Map<string,{text:string;source:"pt"|"en";target:Locale}>());
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{const saved=localStorage.getItem("blu-portal-language"); if(isLocale(saved)) queueMicrotask(()=>setLocaleState(saved));},[]);
  useEffect(()=>{document.documentElement.lang=languages.find(l=>l.code===locale)!.html;},[locale]);
  const setLocale=(next:Locale)=>{setLocaleState(next); localStorage.setItem("blu-portal-language",next); setError(false);};
  const request=useCallback((text:string,source:"pt"|"en")=>{
    const key=`${locale}|${source}|${text}`;
    pending.current.set(key,{text,source,target:locale});
    if(timer.current) return;
    timer.current=setTimeout(()=>{
      const batch=[...pending.current.entries()];pending.current.clear();timer.current=null;
      for(const target of languages.map(l=>l.code)) {
        const group=batch.filter(([,item])=>item.target===target);if(!group.length)continue;
        fetch("/api/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target,items:group.map(([,i])=>({text:i.text,source:i.source}))})})
          .then(async r=>{if(!r.ok)throw new Error();return r.json();})
          .then(result=>{setValues(prev=>({...prev,...Object.fromEntries(group.map(([k],i)=>[k,result.texts[i]]))}));setError(false);})
          .catch(()=>setError(true));
      }
    },60);
  },[locale]);
  return <LocaleContext.Provider value={{locale,setLocale,values,request}}>
    <div className="flex h-dvh flex-col">
    <header className="shrink-0 flex justify-end items-center gap-3 px-4 py-2 bg-[#EBE5DA] border-b relative z-50"><span className="text-xs">🌐</span><LanguagePicker value={locale} onChange={setLocale}/></header>
    {error&&<p role="alert" className="p-2 text-amber-900 bg-amber-50">Tradução local indisponível / Local translation unavailable. <button className="underline" onClick={()=>window.location.reload()}>↻</button></p>}
    <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  </LocaleContext.Provider>;
}
export function useLocale(){const c=useContext(LocaleContext);if(!c)throw new Error("Missing LocaleProvider");return c;}
export function useTranslated(text:string,source:"pt"|"en"="en") {
  const {locale,values,request}=useLocale();
  const key=`${locale}|${source}|${text}`;
  const value=messages[text]?.[locale] ?? values[key];
  useEffect(()=>{if(value===undefined&&locale!==source&&text.trim())request(text,source);},[value,locale,source,text,request]);
  return value ?? text;
}
export function T({text,source="en"}:{text:string;source?:"pt"|"en"}) {return useTranslated(text,source);}

export function LocalizedInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const placeholder=useTranslated(props.placeholder ?? "");
  return <Input {...props} placeholder={placeholder}/>;
}
export function LocalizedTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const placeholder=useTranslated(props.placeholder ?? "");
  return <Textarea {...props} placeholder={placeholder}/>;
}
export function ExportLanguageLinks({tripId,version}:{tripId:string;version:number}) {
  const [language,setLanguage]=useState<Locale>("en");
  return <div className="flex flex-wrap items-center gap-3 my-3"><T text="Idioma do cliente (PDF)" source="pt"/><LanguagePicker value={language} onChange={setLanguage}/><a className="underline" href={`/api/versions?tripId=${encodeURIComponent(tripId)}&version=${version}&format=bundle&locale=${language}`}><T text="Descarregar PDFs" source="pt"/></a></div>;
}
