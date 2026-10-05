"use client";
import { T, useTranslated } from "@/components/LocaleProvider";

import { ActivityConfirmationEditor } from "./ActivityConfirmationEditor";
import { outstandingChecks, type ActivityConfirmation } from "@/lib/activity-confirmation";
import React from "react";
import {
  Bed,
  Compass,
  UtensilsCrossed,
  Car,
  Sun,
  MapPin,
  Clock,
  Lock,
  Unlock,
  Trash2,
} from "lucide-react";
import { ActivityItem, ActivityCategory } from "@/types";
import { ProposalStatus } from "./ProposalStatus";

interface ActivityCardProps {
  activity: ActivityItem;
  onConfirm?: (value: ActivityConfirmation) => Promise<boolean>;
  saving?: boolean;
  onToggleLock?: (activityId: string) => void;
  onRemove?: (activityId: string) => void;
}

const categoryConfig: Record<
  ActivityCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  hotel: {
    label: "Stay",
    icon: Bed,
  },
  activity: {
    label: "Experience",
    icon: Compass,
  },
  restaurant: {
    label: "Dining",
    icon: UtensilsCrossed,
  },
  transport: {
    label: "Transfer",
    icon: Car,
  },
  free_time: {
    label: "Leisure",
    icon: Sun,
  },
};

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  onToggleLock,
  onConfirm,
  onRemove,
  saving,
}) => {
  const pending = outstandingChecks(activity);
  const config = categoryConfig[activity.category] || categoryConfig.activity;
  const Icon = config.icon;
  const lockLabel = useTranslated(
    activity.isLocked ? "Desproteger atividade" : "Proteger atividade",
    "pt",
  );
  const hasDetails = Boolean(
    activity.source ||
      activity.appliedRules?.length ||
      activity.pendingChecks?.length ||
      activity.effortLevel ||
      activity.accessibilityNotes ||
      activity.dietaryNotes,
  );
  return (
    <article
      data-testid="activity-card"
      className={`rounded-2xl border p-4 sm:p-5 bg-white ${activity.isLocked ? "border-[#9DB3B8]" : "border-[#DDD8CE]"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#4A636B]">
        <span className="inline-flex items-center gap-2 font-semibold text-[#143F4B]">
          <Clock aria-hidden="true" className="size-4" />
          <T text={activity.time} source="pt" />
        </span>
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4" />
          <T text={config.label} />
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug text-[#143F4B] break-words">
        <T text={activity.title} source="pt" />
      </h3>
      {activity.location && (
        <p className="mt-2 flex items-start gap-2 text-sm text-[#4A636B]">
          <MapPin aria-hidden="true" className="size-4 shrink-0 mt-0.5" />
          {activity.location}
        </p>
      )}
      {activity.description && (
        <p className="mt-3 text-sm leading-7 text-[#3A535B]">
          <T text={activity.description} source="pt" />
        </p>
      )}
      {activity.duration && (
        <p className="mt-2 text-sm text-[#4A636B]">
          <T text="Duração" source="pt" />: <T text={activity.duration} source="pt" />
        </p>
      )}
      {activity.priceNote && (
        <p className="mt-3 text-sm text-[#765218]">
          <T text={activity.priceNote} source="pt" />
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ProposalStatus
            state={activity.confirmation?.status === "confirmed" ? "confirmed" : "pending"}
          />
          {activity.isLocked && <ProposalStatus state="protected" />}
          {activity.isRecentlyModified && (
            <span className="text-sm text-[#4A636B]">
              <T text="Updated by Assistant" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onToggleLock && (
            <button
              type="button"
              aria-label={lockLabel}
              aria-pressed={Boolean(activity.isLocked)}
              onClick={() => onToggleLock(activity.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#C5D4D8] px-3 py-2 text-sm text-[#143F4B] hover:bg-[#EDF3F4]"
            >
              {activity.isLocked ? (
                <Unlock aria-hidden="true" className="size-4" />
              ) : (
                <Lock aria-hidden="true" className="size-4" />
              )}
              {lockLabel}
            </button>
          )}
          {onRemove && !activity.isLocked && activity.confirmation?.status !== "confirmed" && (
            <button
              type="button"
              aria-label="Remover atividade"
              onClick={() => onRemove(activity.id)}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#E5D7D5] px-3 py-2 text-sm text-[#943D36] hover:bg-[#FDF4F3] transition-colors"
              title="Remover atividade do dia"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              <T text="Remover" source="pt" />
            </button>
          )}
        </div>
      </div>
      {activity.confirmation?.price && (
        <p className="mt-3 text-sm">
          <T
            text={
              activity.confirmation.status === "confirmed" ? "Preço acordado" : "Preço registado"
            }
            source="pt"
          />
          : {activity.confirmation.price}
        </p>
      )}
      {onConfirm && (
        <ActivityConfirmationEditor activity={activity} onSave={onConfirm} disabled={saving} />
      )}
      {hasDetails && (
        <details className="mt-4 border-t border-[#E6E2D8] pt-3 text-sm leading-6 text-[#4A636B]">
          <summary className="cursor-pointer py-1 font-medium text-[#143F4B]">
            <T text="Fontes e detalhes de curadoria" source="pt" />
          </summary>
          <div className="mt-3 space-y-3">
            {activity.source && (
              <p>
                <T text="Fonte" source="pt" />: {activity.source}
              </p>
            )}
            {activity.appliedRules?.length ? (
              <p>
                <T text="Critérios" source="pt" />:{" "}
                <T text={activity.appliedRules.join(" · ")} source="pt" />
              </p>
            ) : null}
            {pending.length ? (
              <p className="text-[#765218]">
                <T text="Por confirmar:" source="pt" /> <T text={pending.join("; ")} source="pt" />
              </p>
            ) : null}
            {activity.effortLevel && (
              <p>
                <T text="Esforço:" source="pt" /> <T text={activity.effortLevel} source="pt" />
              </p>
            )}
            {activity.accessibilityNotes && (
              <p>
                <T text={activity.accessibilityNotes} source="pt" />
              </p>
            )}
            {activity.dietaryNotes && (
              <p>
                <T text={activity.dietaryNotes} source="pt" />
              </p>
            )}
          </div>
        </details>
      )}
    </article>
  );
};
