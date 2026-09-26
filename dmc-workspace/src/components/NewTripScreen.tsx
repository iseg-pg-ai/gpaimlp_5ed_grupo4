"use client";

import React, { useState } from "react";
import { 
  Sparkles, 
  Users, 
  MapPin, 
  Coins, 
  Heart, 
  FileText, 
  RotateCcw, 
  Check, 
  Accessibility, 
  UtensilsCrossed, 
  Clock, 
  Ban, 
  Crown, 
  Footprints, 
  ShieldAlert,
  Compass
} from "lucide-react";
import { 
  CustomerBrief, 
  PhysicalEffortLevel, 
  ProposalTier, 
  DiningPace, 
  MorningPreference 
} from "@/types";
import { initialBrief } from "@/data/mockData";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NewTripScreenProps {
  onGenerate: (brief: CustomerBrief) => void;
  onCancel?: () => void;
}

const interestOptions = [
  "Culture & Heritage",
  "Gastronomy & Petiscos",
  "Douro & Alentejo Wines",
  "Atlantic Coast & Nature",
  "Tile Craft & Architecture",
  "Fado & Traditional Music",
  "Local Markets & Artisans",
  "Contemporary Art (Serralves)",
  "Bespoke Wellness & Spas",
];

const mobilityOptions = [
  "Avoid Steep Stairs (Lisbon/Porto Calçada)",
  "Wheelchair Accessible Routes",
  "Limited Walking Distance (< 1km)",
  "Chauffeured Door-to-door Drop-offs",
  "Elevator Required at Hotels",
];

const dietaryOptions = [
  "Shellfish Allergy",
  "Gluten-Free (Celiac)",
  "Vegetarian",
  "Vegan",
  "Nut Allergy",
  "Dairy-Free (Lactose)",
  "Halal",
  "Kosher",
];

const exclusionOptions = [
  "No Crowded Tour Buses",
  "No Commercial Souvenir Shops",
  "No Standard Large Museums",
  "No Religious / Churches",
  "No Open Boats (Sea Sickness)",
  "No Alcohol / Wine Tastings",
];

const effortLevels: PhysicalEffortLevel[] = [
  "Baixo (Low)",
  "Moderado (Moderate)",
  "Alto (High)",
];

const curationTiers: Array<{ tier: ProposalTier; desc: string }> = [
  { tier: "Classic", desc: "Essential, cohesive & authentic Portuguese highlights" },
  { tier: "Extended", desc: "Curated additional layers, regional craft & depth" },
  { tier: "Signature", desc: "Private VIP access, sommelier-guided & senior historians" },
];

const diningPaces: DiningPace[] = [
  "Quick Lunch (~40m)",
  "Relaxed Dining (~90m)",
  "Tasting Experience (120m+)",
];

const morningPaces: MorningPreference[] = [
  "Early (08:30)",
  "Standard (09:30)",
  "Late Start (10:30+)",
];

const paceOptions: Array<CustomerBrief["pace"]> = ["Relaxed", "Balanced", "Active"];

const accommodationOptions: Array<CustomerBrief["accommodation"]> = [
  "3 star",
  "4 star",
  "5 star",
  "Boutique",
  "Luxury",
];

export const NewTripScreen: React.FC<NewTripScreenProps> = ({
  onGenerate,
  onCancel,
}) => {
  const [brief, setBrief] = useState<CustomerBrief>(initialBrief);

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
    onGenerate(brief);
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#F4F0E7] py-8 px-6 lg:px-12">
      <div className="max-w-3xl mx-auto pb-20">
        {/* BLU Costa Editorial Header */}
        <div className="pb-6 border-b border-[#D5D1C7]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#143F4B] mb-1">
                BLU Costa Travel Curation · Intake
              </p>
              <h1 className="font-serif-blu text-3xl font-normal text-[#143F4B] tracking-tight">
                Plan a Considered Journey
              </h1>
              <p className="text-xs text-[#4A636B] mt-1.5 italic font-serif-blu">
                “Travel is not accumulation. It is interpretation.”
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
              <span>Load Sample Demo Brief</span>
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {/* 1. PROPOSAL CURATION TIER (R33-R44) */}
          <Card className="border-[#2D5B67]/30 bg-white">
            <CardHeader className="pb-3 border-b border-[#F0ECE4]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#D8A65C]" />
                  <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                    Proposal Curation Tier (Rules R33–R44)
                  </CardTitle>
                </div>
                <Badge variant="teal" className="text-[10px]">BLU Standard</Badge>
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
                        <span className={`text-xs font-bold ${isSelected ? "text-[#143F4B]" : "text-[#2D5B67]"}`}>
                          {tier}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#2D5B67]" />}
                      </div>
                      <p className="text-[11px] text-[#4A636B] leading-relaxed">
                        {desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 2. CUSTOMER DETAILS */}
          <Card>
            <CardHeader className="pb-3 border-b border-[#F0ECE4]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2D5B67]" />
                <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                  Customer Details & Occasion
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Customer / Group Name
                  </label>
                  <Input
                    required
                    value={brief.customerName}
                    onChange={(e) =>
                      setBrief({ ...brief, customerName: e.target.value })
                    }
                    placeholder="e.g. Sarah & James"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Special Occasion (R04)
                  </label>
                  <Input
                    value={brief.specialOccasion}
                    onChange={(e) =>
                      setBrief({ ...brief, specialOccasion: e.target.value })
                    }
                    placeholder="e.g. 10th Anniversary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Adults
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={brief.adults}
                    onChange={(e) =>
                      setBrief({ ...brief, adults: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Children
                  </label>
                  <Input
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
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Children Ages (if any)
                  </label>
                  <Input
                    value={brief.childrenAges}
                    onChange={(e) =>
                      setBrief({ ...brief, childrenAges: e.target.value })
                    }
                    placeholder="e.g. 8 and 11"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. TRIP ROUTING & LOGISTICS (Placed directly below Customer Details) */}
          <Card>
            <CardHeader className="pb-3 border-b border-[#F0ECE4]">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#2D5B67]" />
                <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                  Trip Routing & Regional Scale
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Destination Region
                  </label>
                  <Input
                    required
                    value={brief.destination}
                    onChange={(e) =>
                      setBrief({ ...brief, destination: e.target.value })
                    }
                    placeholder="e.g. Portugal (Lisbon, Douro, Porto)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={brief.startDate}
                    onChange={(e) =>
                      setBrief({ ...brief, startDate: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    End Date
                  </label>
                  <Input
                    type="date"
                    value={brief.endDate}
                    onChange={(e) =>
                      setBrief({ ...brief, endDate: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Arrival Airport / Point
                  </label>
                  <Input
                    value={brief.arrivalLocation}
                    onChange={(e) =>
                      setBrief({ ...brief, arrivalLocation: e.target.value })
                    }
                    placeholder="e.g. Lisbon Humberto Delgado Airport (LIS)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Departure Airport / Point
                  </label>
                  <Input
                    value={brief.departureLocation}
                    onChange={(e) =>
                      setBrief({ ...brief, departureLocation: e.target.value })
                    }
                    placeholder="e.g. Porto Francisco Sá Carneiro Airport (OPO)"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. BUDGET & CORE PREFERENCES (Placed directly below Trip Routing) */}
          <Card>
            <CardHeader className="pb-3 border-b border-[#F0ECE4]">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#D8A65C]" />
                <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                  Budget & Curatorial Focus
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Approximate Total Budget
                  </label>
                  <Input
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
                  <label className="block text-xs font-medium text-[#143F4B] mb-1">
                    Currency
                  </label>
                  <select
                    value={brief.currency}
                    onChange={(e) =>
                      setBrief({ ...brief, currency: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#D5D1C7] bg-[#FAF8F3] text-[#143F4B] focus:outline-hidden focus:border-[#2D5B67] focus:ring-1 focus:ring-[#2D5B67] transition-all cursor-pointer"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              {/* Interests multi-select pills */}
              <div>
                <label className="block text-xs font-medium text-[#143F4B] mb-2">
                  Themes & Narrative Elements
                </label>
                <div className="flex flex-wrap gap-2">
                  {interestOptions.map((interest) => {
                    const isSelected = brief.interests.includes(interest);
                    return (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggleArrayItem("interests", interest)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#143F4B] text-[#F4F0E7] shadow-xs"
                            : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                        <span>{interest}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Travel Pace */}
              <div>
                <label className="block text-xs font-medium text-[#143F4B] mb-2">
                  Travel Pace (Thoughtfully Paced)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {paceOptions.map((pace) => {
                    const isSelected = brief.pace === pace;
                    return (
                      <button
                        key={pace}
                        type="button"
                        onClick={() => setBrief({ ...brief, pace })}
                        className={`py-2 px-3 rounded-lg text-xs font-medium text-center transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                            : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                        }`}
                      >
                        {pace}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accommodation */}
              <div>
                <label className="block text-xs font-medium text-[#143F4B] mb-2">
                  Preferred Accommodation Standard
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {accommodationOptions.map((acc) => {
                    const isSelected = brief.accommodation === acc;
                    return (
                      <button
                        key={acc}
                        type="button"
                        onClick={() => setBrief({ ...brief, accommodation: acc })}
                        className={`py-2 px-2.5 rounded-lg text-xs font-medium text-center transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                            : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                        }`}
                      >
                        {acc}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 5. RESTRICTIONS & OPERATIONAL CONSTRAINTS (Placed directly below Budget) */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pt-2">
              <ShieldAlert className="w-4 h-4 text-[#2D5B67]" />
              <h2 className="font-serif-blu font-normal text-sm tracking-tight text-[#143F4B]">
                Restrictions & Curation Constraints (Rules R01–R51)
              </h2>
            </div>

            {/* 5A: PHYSICAL EFFORT & MOBILITY RESTRICTIONS (R15, R16, R17) */}
            <Card>
              <CardHeader className="pb-3 border-b border-[#F0ECE4]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Accessibility className="w-4 h-4 text-[#2D5B67]" />
                    <CardTitle className="text-sm font-serif-blu text-[#143F4B]">
                      Physical Effort & Mobility Constraints (Rule R15–R17)
                    </CardTitle>
                  </div>
                  <Badge variant="teal" className="text-[10px]">Strict Safety</Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-2">
                    Physical Effort Tolerance (Esforço Físico)
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {effortLevels.map((lvl) => {
                      const isSelected = brief.physicalEffort === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setBrief({ ...brief, physicalEffort: lvl })}
                          className={`py-2 px-3 rounded-lg text-xs font-medium text-center transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                              : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                          }`}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#7E9399] mt-1.5">
                    Baixo: Flat walking, level access, chauffeured transfers directly to viewpoints (eliminates steep stair ascents in Lisbon/Sintra).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-2">
                    Specific Mobility Needs & Terrain Adjustments
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {mobilityOptions.map((opt) => {
                      const isSelected = brief.mobilityRestrictions.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleArrayItem("mobilityRestrictions", opt)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#143F4B] text-[#F4F0E7] shadow-xs"
                              : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                          <span>{opt}</span>
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
                      Dietary Allergies & Dining Requirements (Rule R02, R04)
                    </CardTitle>
                  </div>
                  <Badge variant="gold" className="text-[10px]">Allergen Protocol</Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-2">
                    Dietary Restrictions & Allergens (Cross-checks Restaurant Database)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {dietaryOptions.map((opt) => {
                      const isSelected = brief.dietaryRestrictions.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleArrayItem("dietaryRestrictions", opt)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? "bg-emerald-800 text-white shadow-xs"
                              : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-2">
                    Dining Pace & Table Duration
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {diningPaces.map((dp) => {
                      const isSelected = brief.diningPace === dp;
                      return (
                        <button
                          key={dp}
                          type="button"
                          onClick={() => setBrief({ ...brief, diningPace: dp })}
                          className={`py-2 px-3 rounded-lg text-xs font-medium text-center transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                              : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                          }`}
                        >
                          {dp}
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
                    Daily Rhythm & Explicit Exclusions (Rule R03, R05)
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-2">
                    Morning Start Preference (Horários e Hábitos Pessoais)
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {morningPaces.map((mp) => {
                      const isSelected = brief.morningPreference === mp;
                      return (
                        <button
                          key={mp}
                          type="button"
                          onClick={() => setBrief({ ...brief, morningPreference: mp })}
                          className={`py-2 px-3 rounded-lg text-xs font-medium text-center transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-[#E7EEF0] border-[#2D5B67] text-[#143F4B] shadow-2xs font-semibold"
                              : "bg-[#FAF8F3] border-[#D5D1C7] text-[#4A636B] hover:bg-white"
                          }`}
                        >
                          {mp}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#143F4B] mb-2">
                    Atividades Expressamente Indesejadas (Do Not Propose)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {exclusionOptions.map((opt) => {
                      const isSelected = brief.exclusions.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleArrayItem("exclusions", opt)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? "bg-red-800 text-white shadow-xs"
                              : "bg-[#FAF8F3] text-[#2D5B67] border border-[#D5D1C7] hover:border-[#2D5B67]"
                          }`}
                        >
                          {isSelected ? <Ban className="w-3 h-3 stroke-[2.5]" /> : null}
                          <span>{opt}</span>
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
                  Curator Perspective & Personal Nuances
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              <Textarea
                rows={3}
                value={brief.notes}
                onChange={(e) => setBrief({ ...brief, notes: e.target.value })}
                placeholder="Nuances, customer personality, travel memories..."
                className="leading-relaxed"
              />
            </CardContent>
          </Card>

          {/* 7. PRIMARY CTA */}
          <div className="pt-4 flex items-center justify-end gap-3 sticky bottom-4 z-20 bg-[#F4F0E7]/95 backdrop-blur-xs p-3 rounded-2xl border border-[#D5D1C7] shadow-md">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}

            <Button
              type="submit"
              size="lg"
              variant="default"
              className="gap-2 shadow-sm font-semibold bg-[#2D5B67] hover:bg-[#1E4651] text-[#F4F0E7]"
            >
              <Sparkles className="w-4 h-4 text-[#D8A65C]" />
              <span>Curate Proposal ({brief.proposalTier} Tier)</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
