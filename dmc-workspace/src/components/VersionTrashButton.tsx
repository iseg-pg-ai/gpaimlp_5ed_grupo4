"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { T } from "@/components/LocaleProvider";

export function VersionTrashButton({
  tripId,
  version,
  action = "trash",
  onComplete,
}: {
  tripId: string;
  version: number;
  action?: "trash" | "restore";
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restore = action === "restore";
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/versions/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, version, action }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a versão.");
      onComplete?.();
      router.refresh();
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#D5D1C7] px-3 py-2 text-sm text-[#70443E] hover:bg-[#F7E9E6] disabled:opacity-50"
      >
        {restore ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
        <T
          text={busy ? "A atualizar…" : restore ? "Restaurar versão" : "Enviar para o Lixo"}
          source="pt"
        />
      </button>
      {error && <span className="mt-1 text-xs text-red-800">{error}</span>}
    </span>
  );
}
