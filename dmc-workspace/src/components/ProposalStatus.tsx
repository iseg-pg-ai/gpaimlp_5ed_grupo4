// Resume o estado da proposta e as condições ainda pendentes de revisão.
"use client";

import { T } from "@/components/LocaleProvider";
import { FileText, Clock, Lock, Download, CheckCircle } from "lucide-react";

const states = {
  confirmed: {
    label: "Confirmada",
    icon: CheckCircle,
    style:
      "border-[var(--portal-line-98bcaa)] bg-[var(--portal-bg-eaf5ef)] text-[var(--portal-text-245c49)]",
  },
  draft: {
    label: "Rascunho",
    icon: FileText,
    style:
      "border-[var(--portal-line-c5d4d8)] bg-[var(--portal-bg-edf3f4)] text-[var(--portal-text-143f4b)]",
  },
  pending: {
    label: "Por confirmar",
    icon: Clock,
    style:
      "border-[var(--portal-line-e4d1ad)] bg-[var(--portal-bg-fff8eb)] text-[var(--portal-text-765218)]",
  },
  protected: {
    label: "Protegida",
    icon: Lock,
    style:
      "border-[var(--portal-line-bbcbcd)] bg-[var(--portal-bg-e7eeef)] text-[var(--portal-text-143f4b)]",
  },
  exported: {
    label: "Exportada",
    icon: Download,
    style:
      "border-[var(--portal-line-c7c9de)] bg-[var(--portal-bg-f0f0f8)] text-[var(--portal-text-454466)]",
  },
};

export function ProposalStatus({ state }: { state: keyof typeof states }) {
  const { label, icon: Icon, style } = states[state];
  return (
    <span
      data-status={state}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${style}`}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <T text={label} source="pt" />
    </span>
  );
}
