"use client";

import { useState } from "react";
import { ShareProposalModal } from "@/components/ShareProposalModal";

export function ShareFromHistory({ tripId, version, leadId }: {
  tripId: string; version: number; leadId?: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="mt-3 mr-4 underline cursor-pointer" onClick={() => setOpen(true)}>
      Preparar link para WhatsApp / email
    </button>
    {open && <ShareProposalModal
      tripId={tripId} currentVersion={version} versions={[{ version, createdAt: "" }]}
      defaultLocale="en" customerName="" destination="" leadId={leadId}
      onClose={() => setOpen(false)}
    />}
  </>;
}
