"use client";

import { T } from "@/components/LocaleProvider";
import { FileText, Clock, Lock, Download, CheckCircle } from "lucide-react";

const states = {
  confirmed: {
    label: "Confirmada",
    icon: CheckCircle,
    style: "border-[#98BCAA] bg-[#EAF5EF] text-[#245C49]",
  },
  draft: {
    label: "Rascunho",
    icon: FileText,
    style: "border-[#C5D4D8] bg-[#EDF3F4] text-[#143F4B]",
  },
  pending: {
    label: "Por confirmar",
    icon: Clock,
    style: "border-[#E4D1AD] bg-[#FFF8EB] text-[#765218]",
  },
  protected: {
    label: "Protegida",
    icon: Lock,
    style: "border-[#BBCBCD] bg-[#E7EEEF] text-[#143F4B]",
  },
  exported: {
    label: "Exportada",
    icon: Download,
    style: "border-[#C7C9DE] bg-[#F0F0F8] text-[#454466]",
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
