"use client";
import { T, LocalizedInput, LocalizedTextarea } from "@/components/LocaleProvider";

import { BriefPersonalization } from "./BriefPersonalization";
import { accompanimentLabels } from "@/lib/brief-personalization";
import { validateBrief } from "@/lib/curation";
import React, { useState } from "react";
import {
  Sparkles,
  Users,
  MapPin,
  Coins,
  FileText,
  RotateCcw,
  Check,
  Accessibility,
  UtensilsCrossed,
  Clock,
  Ban,
  Crown,
  ShieldAlert,
} from "lucide-react";
import { CustomerBrief } from "@/types";
import {
  interestOptions,
  mobilityOptions,
  dietaryOptions,
  exclusionOptions,
  effortLevels,
  curationTiers,
  diningPaces,
  morningPaces,
  paceOptions,
  accommodationOptions,
} from "@/lib/brief-options";
import { initialBrief } from "@/data/initialBrief";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NewTripScreenProps {
  onGenerate: (brief: CustomerBrief) => void;
  initialValue?: CustomerBrief;
  onCancel?: () => void;
}

export const NewTripScreen: React.FC<NewTripScreenProps> = ({
  onGenerate,
  onCancel,
  initialValue,
}) => {
  const [brief, setBrief] = useState<CustomerBrief>(initialValue ?? initialBrief);

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const steps = ["Cliente", "Viagem", "Preferências", "Restrições", "Rever"];
  const go = (target: number) => {
    setStep(target);
    setError("");
  };
  const toggleArrayItem = (field: keyof CustomerBrief, item: string) => {
    setBrief((prev) => {
      const list = (prev[field] as string[]) || [];
      const exists = list.includes(item);
      return {
        ...prev,
        [field]: exists ? list.filter((i) => i !== item) : [...list, item],
      };
    });
  };

  const handlePreFillDemo = () => {
    setBrief(initialBrief);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 4) {
      go(step + 1);
      return;
    }
    try {
      if (!brief.customerEmail?.trim()) throw new Error("Indique o email do cliente.");
      validateBrief(brief);
      onGenerate(brief);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Briefing inválido.");
    }
  };

  return (
    <div className="flex-1 min-w-0 bg-[#F4F0E7] py-5 px-3 sm:py-8 sm:px-6 lg:px-12">
      <div className="max-w-3xl mx-auto pb-20">
        {/* BLU Costa Editorial Header */}
        <div className="pb-6 border-b border-[#D5D1C7]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-[#143F4B] mb-1">
                <T text="BLU Costa Travel Curation · Intake" source="en" />{" "}
              </p>
              <h1 className="font-serif-blu text-3xl font-normal text-[#143F4B] tracking-tight">
                <T text="Plan a Considered Journey" source="en" />{" "}
              </h1>
              <p className="text-sm text-[#4A636B] mt-1.5 italic font-serif-blu">
                <T text="“Travel is not accumulation. It is interpretation.”" source="en" />{" "}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreFillDemo}
              className="border-[#D8A65C]/60 bg-[#FBF4E8] text-[#9E6E24] hover:bg-[#F5ECD8] shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              <span>
                <T text="Load Sample Demo Brief" source="en" />
              </span>
            </Button>
          </div>
        </div>

        <nav aria-label="Etapas do briefing" className="mt-6 flex flex-wrap gap-2">
          {steps.map((label, index) => (
            <button
              type="button"
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={`rounded-lg border px-3 py-2 ${step === index ? "bg-[#143F4B] text-white" : "bg-white"}`}
              onClick={() => go(index)}
            >
              <T text={label} source="pt" />
            </button>
          ))}
        </nav>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <fieldset
            hidden={step !== 0}
            disabled={step !== 0}
            className="space-y-6"
            data-brief-step="0"
          >
            {/* 2. CUSTOMER DETAILS */}
            <Card>
              <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#2D5B67]" />
                  <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                    <T text="Customer Details & Occasion" source="en" />{" "}
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Customer / Group Name" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      required
                      value={brief.customerName}
                      onChange={(e) => setBrief({ ...brief, customerName: e.target.value })}
                      placeholder="e.g. Sarah & James"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Email do cliente" source="pt" />
                    </label>
                    <LocalizedInput
                      type="email"
                      required
                      value={brief.customerEmail ?? ""}
                      onChange={(e) => setBrief({ ...brief, customerEmail: e.target.value })}
                      placeholder="cliente@example.com"
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Special Occasion (R04)" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      value={brief.specialOccasion}
                      onChange={(e) => setBrief({ ...brief, specialOccasion: e.target.value })}
                      placeholder="e.g. 10th Anniversary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Adults" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      type="number"
                      min={1}
                      value={brief.adults}
                      onChange={(e) =>
                        setBrief({ ...brief, adults: parseInt(e.target.value) || 1 })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Children" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      type="number"
                      min={0}
                      value={brief.children}
                      onChange={(e) =>
                        setBrief({
                          ...brief,
                          children: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Children Ages (if any)" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      value={brief.childrenAges}
                      onChange={(e) => setBrief({ ...brief, childrenAges: e.target.value })}
                      placeholder="e.g. 8 and 11"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </fieldset>
          <fieldset
            hidden={step !== 1}
            disabled={step !== 1}
            className="space-y-6"
            data-brief-step="1"
          >
            {/* 3. TRIP ROUTING & LOGISTICS (Placed directly below Customer Details) */}
            <Card>
              <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#2D5B67]" />
                  <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                    <T text="Trip Routing & Regional Scale" source="en" />{" "}
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Destination Region" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      required
                      value={brief.destination}
                      onChange={(e) => setBrief({ ...brief, destination: e.target.value })}
                      placeholder="e.g. Portugal (Lisbon, Douro, Porto)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Start Date" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      type="date"
                      required
                      value={brief.startDate}
                      onChange={(e) => setBrief({ ...brief, startDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="End Date" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      type="date"
                      required
                      value={brief.endDate}
                      onChange={(e) => setBrief({ ...brief, endDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Arrival Airport / Point" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      value={brief.arrivalLocation}
                      onChange={(e) => setBrief({ ...brief, arrivalLocation: e.target.value })}
                      placeholder="e.g. Lisbon Humberto Delgado Airport (LIS)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Departure Airport / Point" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      value={brief.departureLocation}
                      onChange={(e) => setBrief({ ...brief, departureLocation: e.target.value })}
                      placeholder="e.g. Porto Francisco Sá Carneiro Airport (OPO)"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </fieldset>
          <fieldset
            hidden={step !== 2}
            disabled={step !== 2}
            className="space-y-6"
            data-brief-step="2"
          >
            {/* 1. PROPOSAL CURATION TIER (R33-R44) */}
            <Card className="border-[#2D5B67]/30 bg-white">
              <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-[#D8A65C]" />
                    <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                      <T text="Proposal Curation Tier (Rules R33–R44)" source="en" />{" "}
                    </CardTitle>
                  </div>
                  <Badge variant="teal" className="text-xs">
                    <T text="BLU Standard" source="en" />
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {curationTiers.map(({ tier, desc }) => {
                    const isSelected = brief.proposalTier === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setBrief({ ...brief, proposalTier: tier })}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#E7EEF0] border-[#2D5B67] ring-1 ring-[#2D5B67]/30 shadow-2xs"
                            : "bg-[#FAF8F3] border-[#D5D1C7] hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-sm font-bold ${isSelected ? "text-[#143F4B]" : "text-[#2D5B67]"}`}
                          >
                            {tier}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#2D5B67]" />}
                        </div>
                        <p className="text-xs text-[#4A636B] leading-relaxed">
                          <T text={desc} source="en" />
                        </p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* 4. BUDGET & CORE PREFERENCES (Placed directly below Trip Routing) */}
            <Card>
              <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-[#D8A65C]" />
                  <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                    <T text="Budget & Curatorial Focus" source="en" />{" "}
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Approximate Total Budget" source="en" />{" "}
                    </label>
                    <LocalizedInput
                      type="number"
                      step="500"
                      value={brief.budget}
                      onChange={(e) =>
                        setBrief({
                          ...brief,
                          budget: parseInt(e.target.value) || 0,
                        })
                      }
                      className="font-mono text-[#143F4B]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-1">
                      <T text="Currency" source="en" />{" "}
                    </label>
                    <select
                      value={brief.currency}
                      onChange={(e) => setBrief({ ...brief, currency: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#D5D1C7] bg-[#FAF8F3] text-[#143F4B] focus:outline-hidden focus:border-[#2D5B67] focus:ring-1 focus:ring-[#2D5B67] transition-all cursor-pointer"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>

                {/* Interests multi-select pills */}
                <div>
                  <label className="block text-sm font-medium text-[#143F4B] mb-2">
                    <T text="Themes & Narrative Elements" source="en" />{" "}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {interestOptions.map((interest) => {
                      const isSelected = brief.interests.includes(interest);
                      return (
                        <button
                          key={interest}
                          type="button"
                          onClick={() => toggleArrayItem("interests", interest)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#143F4B] text-[#F4F0E7] shadow-xs"
                              : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                          <span>
                            <T text={interest} source="en" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Travel Pace */}
                <div>
                  <label className="block text-sm font-medium text-[#143F4B] mb-2">
                    <T text="Travel Pace (Thoughtfully Paced)" source="en" />{" "}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {paceOptions.map((pace) => {
                      const isSelected = brief.pace === pace;
                      return (
                        <button
                          key={pace}
                          type="button"
                          onClick={() => setBrief({ ...brief, pace })}
                          className={`py-2 px-3 rounded-lg text-sm font-medium text-center transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                              : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                          }`}
                        >
                          <T text={pace} source="en" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accommodation */}
                <div>
                  <label className="block text-sm font-medium text-[#143F4B] mb-2">
                    <T text="Preferred Accommodation Standard" source="en" />{" "}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {accommodationOptions.map((acc) => {
                      const isSelected = brief.accommodation === acc;
                      return (
                        <button
                          key={acc}
                          type="button"
                          onClick={() => setBrief({ ...brief, accommodation: acc })}
                          className={`py-2 px-2.5 rounded-lg text-sm font-medium text-center transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                              : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                          }`}
                        >
                          <T text={acc} source="en" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <BriefPersonalization
              value={brief.personalization}
              onChange={(personalization) => setBrief({ ...brief, personalization })}
            />
          </fieldset>
          <fieldset
            hidden={step !== 3}
            disabled={step !== 3}
            className="space-y-6"
            data-brief-step="3"
          >
            {/* 5. RESTRICTIONS & OPERATIONAL CONSTRAINTS (Placed directly below Budget) */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 pt-2">
                <ShieldAlert className="w-4 h-4 text-[#2D5B67]" />
                <h2 className="font-serif-blu font-normal text-sm tracking-tight text-[#143F4B]">
                  <T text="Restrictions & Curation Constraints (Rules R01–R51)" source="en" />{" "}
                </h2>
              </div>

              {/* 5A: PHYSICAL EFFORT & MOBILITY RESTRICTIONS (R15, R16, R17) */}
              <Card>
                <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Accessibility className="w-4 h-4 text-[#2D5B67]" />
                      <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                        <T
                          text="Physical Effort & Mobility Constraints (Rule R15–R17)"
                          source="en"
                        />{" "}
                      </CardTitle>
                    </div>
                    <Badge variant="teal" className="text-xs">
                      <T text="Strict Safety" source="en" />
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-2">
                      <T text="Physical Effort Tolerance (Esforço Físico)" source="en" />{" "}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {effortLevels.map((lvl) => {
                        const isSelected = brief.physicalEffort === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setBrief({ ...brief, physicalEffort: lvl })}
                            className={`py-2 px-3 rounded-lg text-sm font-medium text-center transition-all cursor-pointer border ${
                              isSelected
                                ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                                : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                            }`}
                          >
                            <T text={lvl} />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-[#4A636B] mt-1.5">
                      <T
                        text="Baixo: Flat walking, level access, chauffeured transfers directly to viewpoints (eliminates steep stair ascents in Lisbon/Sintra)."
                        source="en"
                      />{" "}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-2">
                      <T text="Specific Mobility Needs & Terrain Adjustments" source="en" />{" "}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {mobilityOptions.map((opt) => {
                        const isSelected = brief.mobilityRestrictions.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleArrayItem("mobilityRestrictions", opt)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#143F4B] text-[#F4F0E7] shadow-xs"
                                : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                            <span>
                              <T text={opt} source="en" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 5B: DIETARY & CULINARY RESTRICTIONS (R02, R04) */}
              <Card>
                <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-4 h-4 text-[#D8A65C]" />
                      <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                        <T
                          text="Dietary Allergies & Dining Requirements (Rule R02, R04)"
                          source="en"
                        />{" "}
                      </CardTitle>
                    </div>
                    <Badge variant="gold" className="text-xs">
                      <T text="Allergen Protocol" source="en" />
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-2">
                      <T
                        text="Dietary Restrictions & Allergens (Cross-checks Restaurant Database)"
                        source="en"
                      />{" "}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {dietaryOptions.map((opt) => {
                        const isSelected = brief.dietaryRestrictions.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleArrayItem("dietaryRestrictions", opt)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-emerald-800 text-white shadow-xs"
                                : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                            <span>
                              <T text={opt} source="en" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-2">
                      <T text="Dining Pace & Table Duration" source="en" />{" "}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {diningPaces.map((dp) => {
                        const isSelected = brief.diningPace === dp;
                        return (
                          <button
                            key={dp}
                            type="button"
                            onClick={() => setBrief({ ...brief, diningPace: dp })}
                            className={`py-2 px-3 rounded-lg text-sm font-medium text-center transition-all cursor-pointer border ${
                              isSelected
                                ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                                : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                            }`}
                          >
                            <T text={dp} source="en" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 5C: DAILY RHYTHM & EXPLICIT EXCLUSIONS (R03, R05) */}
              <Card>
                <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#2D5B67]" />
                    <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                      <T
                        text="Daily Rhythm & Explicit Exclusions (Rule R03, R05)"
                        source="en"
                      />{" "}
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="pt-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-2">
                      <T
                        text="Morning Start Preference (Horários e Hábitos Pessoais)"
                        source="en"
                      />{" "}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {morningPaces.map((mp) => {
                        const isSelected = brief.morningPreference === mp;
                        return (
                          <button
                            key={mp}
                            type="button"
                            onClick={() => setBrief({ ...brief, morningPreference: mp })}
                            className={`py-2 px-3 rounded-lg text-sm font-medium text-center transition-all cursor-pointer border ${
                              isSelected
                                ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                                : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                            }`}
                          >
                            <T text={mp} source="en" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#143F4B] mb-2">
                      <T
                        text="Atividades Expressamente Indesejadas (Do Not Propose)"
                        source="pt"
                      />{" "}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {exclusionOptions.map((opt) => {
                        const isSelected = brief.exclusions.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleArrayItem("exclusions", opt)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-red-800 text-white shadow-xs"
                                : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                            }`}
                          >
                            {isSelected ? <Ban className="w-3 h-3 stroke-[2.5]" /> : null}
                            <span>
                              <T text={opt} source="en" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 6. ADDITIONAL CONTEXT & AGENT NOTES */}
            <Card>
              <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#2D5B67]" />
                  <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                    <T text="Curator Perspective & Personal Nuances" source="en" />{" "}
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-4">
                <LocalizedTextarea
                  rows={3}
                  value={brief.notes}
                  onChange={(e) => setBrief({ ...brief, notes: e.target.value })}
                  placeholder="Nuances, customer personality, travel memories..."
                  className="leading-relaxed"
                />
              </CardContent>
            </Card>
          </fieldset>
          {step === 4 && (
            <section
              data-testid="brief-review"
              className="rounded-xl border bg-white p-5 space-y-4"
            >
              <h2 className="text-xl">
                <T text="Rever antes de gerar" source="pt" />
              </h2>
              <p>
                <T
                  text="Confirme as respostas. Use as etapas acima para editar sem perder os dados."
                  source="pt"
                />
              </p>
              <dl className="space-y-3">
                {Object.entries(brief)
                  .filter(([key]) => key !== "personalization")
                  .map(([key, value]) => (
                    <div key={key} className="break-words">
                      <dt className="font-semibold">
                        <T text={reviewLabels[key] ?? key} source="pt" />
                      </dt>
                      <dd>
                        {Array.isArray(value)
                          ? value.map((v) => (
                              <span key={v} className="mr-2">
                                <T text={v} />
                              </span>
                            ))
                          : String(value === "" ? "—" : value)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {brief.personalization && (
                <div className="space-y-2">
                  {Object.entries(brief.personalization).map(([key, value]) => (
                    <p key={key} className="break-words">
                      <strong>
                        <T text={reviewLabels[key] ?? key} source="pt" />:{" "}
                      </strong>
                      {Array.isArray(value) ? (
                        value.map((v) => (
                          <span key={v} className="mr-2">
                            <T text={v} source="pt" />
                          </span>
                        ))
                      ) : typeof value === "boolean" ? (
                        <T text={value ? "Sim" : "Não"} source="pt" />
                      ) : key === "accompaniment" ? (
                        <T
                          text={accompanimentLabels[value as keyof typeof accompanimentLabels]}
                          source="pt"
                        />
                      ) : (
                        String(value === "" ? "—" : value)
                      )}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
          {error && (
            <p role="alert" className="text-red-800">
              <T text={error} source="pt" />
            </p>
          )}
          {/* 7. PRIMARY CTA */}
          <div className="pt-4 flex items-center justify-end gap-3 flex-wrap sticky bottom-4 z-20 bg-[#F4F0E7]/95 backdrop-blur-xs p-3 rounded-2xl border border-[#D5D1C7] shadow-md">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                <T text="Cancel" source="en" />{" "}
              </Button>
            )}

            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => go(step - 1)}>
                <T text="Anterior" source="pt" />
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              variant="default"
              className="gap-2 shadow-sm font-semibold bg-[#2D5B67] hover:bg-[#1E4651] text-[#F4F0E7]"
            >
              <Sparkles className="w-4 h-4 text-[#D8A65C]" />
              <span>
                {step === 4 ? (
                  <>
                    <T text="Curate Proposal" /> ({brief.proposalTier})
                  </>
                ) : (
                  <T text="Seguinte" source="pt" />
                )}
              </span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const reviewLabels: Record<string, string> = {
  customerName: "Cliente",
  customerEmail: "Email do cliente",
  adults: "Adultos",
  children: "Crianças",
  childrenAges: "Idades das crianças",
  destination: "Destino",
  startDate: "Data de início",
  endDate: "Data de fim",
  arrivalLocation: "Chegada",
  departureLocation: "Partida",
  budget: "Orçamento",
  currency: "Moeda",
  interests: "Interesses",
  pace: "Ritmo",
  accommodation: "Alojamento",
  proposalTier: "Nível da proposta",
  physicalEffort: "Esforço físico",
  mobilityRestrictions: "Mobilidade",
  dietaryRestrictions: "Alimentação",
  diningPace: "Ritmo das refeições",
  morningPreference: "Início do dia",
  exclusions: "Exclusões",
  specialOccasion: "Ocasião especial",
  notes: "Notas",
  mustHave: "Experiências imperdíveis",
  avoid: "Atividades a evitar",
  budgetFlex: "Margem autorizada (%)",
  extraBreaks: "Pausas adicionais",
  groupNeeds: "Necessidades do grupo",
  accompaniment: "Acompanhamento",
  guideLanguage: "Idioma do acompanhamento",
};
