import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#2D5B67] text-white",
        teal: "border-[#2D5B67]/30 bg-[#E7EEF0] text-[#2D5B67]",
        gold: "border-[#D8A65C]/40 bg-[#FBF4E8] text-[#9E6E24]",
        ink: "border-transparent bg-[#143F4B] text-[#F4F0E7]",
        secondary: "border-[#D5D1C7] bg-[#EBE5DA] text-[#143F4B]",
        accent: "border-[#D8A65C]/40 bg-[#FBF4E8] text-[#9E6E24]",
        outline: "border-[#D5D1C7] bg-white text-[#143F4B]",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
