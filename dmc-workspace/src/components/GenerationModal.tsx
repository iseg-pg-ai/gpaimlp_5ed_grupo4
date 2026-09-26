"use client";

import React, { useEffect, useState } from "react";
import { Check, Compass, Sparkles, Loader2 } from "lucide-react";

interface GenerationModalProps {
  onComplete: () => void;
  destination: string;
  customerName: string;
}

const steps = [
  "01 Understand — Analyzing traveler needs & restrictions",
  "02 Interpret — Establishing narrative route & pacing",
  "03 Curate — Selecting local providers & dining safety",
  "04 Viability — Validating physical effort & access (R15–R17)",
  "05 Finalize — Composing bespoke Journey Proposal",
];

export const GenerationModal: React.FC<GenerationModalProps> = ({
  onComplete,
  destination,
  customerName,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    // Step timings totaling ~2.8s
    const stepDurations = [550, 600, 600, 550, 500];
    
    let timer: NodeJS.Timeout;
    
    const advanceStep = (index: number) => {
      if (index < steps.length - 1) {
        timer = setTimeout(() => {
          setCurrentStepIndex(index + 1);
          advanceStep(index + 1);
        }, stepDurations[index]);
      } else {
        // Complete and transition
        timer = setTimeout(() => {
          onComplete();
        }, stepDurations[index]);
      }
    };

    advanceStep(0);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const progressPercentage = Math.round(((currentStepIndex + 1) / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E282F]/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-[#F4F0E7] border border-[#D5D1C7] p-7 shadow-2xl animate-in zoom-in-95 duration-250">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#143F4B] text-[#D8A65C] flex items-center justify-center shadow-xs">
            <span className="font-serif-blu font-bold text-base">B</span>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2D5B67]">
              BLU Costa Travel Curation
            </div>
            <h3 className="font-serif-blu text-base font-bold text-[#143F4B]">
              Synthesizing Bespoke Proposal
            </h3>
          </div>
        </div>

        <div className="mt-2 text-xs text-[#4A636B] leading-relaxed">
          Curating a considered journey to <span className="font-semibold text-[#143F4B]">{destination}</span> for{" "}
          <span className="font-semibold text-[#143F4B]">{customerName}</span>.
        </div>

        {/* Minimal Progress Bar */}
        <div className="mt-5">
          <div className="flex justify-between text-[11px] text-[#698288] font-mono mb-1.5">
            <span>Curation progress</span>
            <span>{progressPercentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#E2DDD3] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2D5B67] transition-all duration-300 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Progressive Steps Checklist */}
        <div className="mt-6 space-y-2.5">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            return (
              <div
                key={idx}
                className={`flex items-center gap-3 text-xs transition-colors duration-200 ${
                  isCompleted
                    ? "text-[#143F4B] font-medium"
                    : isCurrent
                    ? "text-[#2D5B67] font-semibold"
                    : "text-[#A9A499]"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] transition-all ${
                    isCompleted
                      ? "bg-[#2D5B67] text-white"
                      : isCurrent
                      ? "bg-[#D8A65C] text-[#143F4B]"
                      : "bg-[#E2DDD3] text-[#A9A499]"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span>{step}</span>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-6 pt-4 border-t border-[#D5D1C7] text-center text-[11px] text-[#698288] font-serif-blu italic">
          “A journey should feel considered, not assembled.”
        </div>
      </div>
    </div>
  );
};
