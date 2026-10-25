import type { CustomerBrief } from "@/types";

export const initialBrief: CustomerBrief = {
  customerName: "Marta & Miguel",
  customerEmail: "marta.miguel@example.com",
  adults: 2,
  children: 0,
  childrenAges: "",
  destination: "Portugal",
  startDate: "2027-05-18",
  endDate: "2027-05-23",
  arrivalLocation: "Lisbon Humberto Delgado Airport (LIS)",
  arrivalTime: "09:40",
  arrivalFlightNumber: "TP 1021",
  departureLocation: "Porto Francisco Sá Carneiro Airport (OPO)",
  departureTime: "18:15",
  departureFlightNumber: "TP 1935",
  budget: 4800,
  currency: "EUR",
  interests: [
    "Culture & Heritage",
    "Gastronomy & Petiscos",
    "Douro & Alentejo Wines",
    "Local Markets & Artisans",
  ],
  pace: "Relaxed",
  accommodation: "Boutique",
  // BLU Curation Criteria
  proposalTier: "Signature",
  physicalEffort: "Moderado (Moderate)",
  mobilityRestrictions: [],
  dietaryRestrictions: [],
  diningPace: "Relaxed Dining (~90m)",
  morningPreference: "Standard (09:30)",
  exclusions: ["No Crowded Tour Buses", "No Commercial Souvenir Shops"],
  specialOccasion: "5th Wedding Anniversary",
  notes:
    "Surprise journey. They value Portuguese heritage, local artisans, gastronomy and one memorable final experience in Porto. Keep internal planning notes out of customer-facing exports.",
};
