"use client";
import { useEffect, useRef, useState } from "react";
import { responseJson } from "@/lib/http-client";
import { emptyMatching } from "@/lib/catalog-matching";
import {
  emptyFields,
  type Category,
  type CatalogRecord,
  type CatalogInput,
} from "@/lib/catalog-schema";
type Entry = CatalogRecord & { published?: boolean };
export function useCatalog() {
  const operation = useRef(false);
  const [records, setRecords] = useState<Entry[]>([]);
  const [category, setCategory] = useState<Category>("atracoes");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [editing, setEditing] = useState<CatalogInput | null>(null);
  const [history, setHistory] = useState<CatalogRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editorRef = useRef<HTMLFormElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  async function load() {
    const data = await responseJson<Entry[]>(await fetch("/api/catalog", { cache: "no-store" }));
    setRecords(data);
  }
  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { cache: "no-store" })
      .then(responseJson<Entry[]>)
      .then((data) => {
        if (active) setRecords(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const editorKey = editing ? `${editing.category}:${editing.id ?? "new"}` : "";
  useEffect(() => {
    if (editorKey) {
      editorRef.current?.scrollIntoView({ block: "start" });
      editorRef.current?.querySelector("input")?.focus();
    }
  }, [editorKey]);
  const norm = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = records
    .filter(
      (r) =>
        r.category === category &&
        (!status || r.status === status) &&
        (!location || r.fields.location === location) &&
        norm(
          [r.fields.name, r.fields.location, r.fields.description, r.fields.provider, r.id].join(
            " ",
          ),
        ).includes(norm(query)),
    )
    .sort((a, b) => a.fields.name.localeCompare(b.fields.name));
  const locations = [
    ...new Set(
      records
        .filter((r) => r.category === category)
        .map((r) => r.fields.location)
        .filter(Boolean),
    ),
  ].sort();
  function edit(record?: Entry) {
    setHistory(null);
    setError("");
    setNotice("");
    setEditing(
      record
        ? {
            id: record.id,
            category: record.category,
            status: record.status,
            baseRevision: record.revision,
            fields: { ...record.fields },
            matching: record.matching ?? emptyMatching(),
            reason: "",
          }
        : {
            category,
            status: "draft",
            baseRevision: null,
            fields: emptyFields(),
            matching: emptyMatching(),
            reason: "Criação de registo",
          },
    );
  }
  async function save(input: CatalogInput) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      // Preserve the draft on conflict, but refresh the list so reopening uses the current revision.
      if (response.status === 409) await load();
      await responseJson(response);
      setEditing(null);
      setHistory(null);
      setNotice(
        "Registo guardado. Atualize o catálogo para disponibilizar a revisão aprovada nos novos roteiros.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function showHistory(record: Entry) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      setHistory(
        await responseJson<CatalogRecord[]>(
          await fetch(`/api/catalog?id=${encodeURIComponent(record.id)}`),
        ),
      );
      requestAnimationFrame(() => historyRef.current?.scrollIntoView({ block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o histórico.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function publish() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await responseJson(await fetch("/api/catalog/publish", { method: "POST" }));
      await load();
      setNotice(
        "Catálogo atualizado. Apenas as revisões aprovadas ficam disponíveis para novos roteiros.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return {
    category,
    setCategory,
    query,
    setQuery,
    status,
    setStatus,
    location,
    setLocation,
    editing,
    setEditing,
    history,
    setHistory,
    loading,
    busy,
    error,
    notice,
    editorRef,
    historyRef,
    filtered,
    locations,
    edit,
    save,
    showHistory,
    publish,
  };
}
