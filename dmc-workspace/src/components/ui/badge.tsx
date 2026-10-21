import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--portal-bg-2d5b67)] text-white",
        teal: "border-[var(--portal-line-2d5b67)]/30 bg-[var(--portal-bg-e7eef0)] text-[var(--portal-text-2d5b67)]",
        gold: "border-[var(--portal-line-d8a65c)]/40 bg-[var(--portal-bg-fbf4e8)] text-[var(--portal-text-9e6e24)]",
        ink: "border-transparent bg-[var(--portal-bg-143f4b)] text-[#F4F0E7]",
        secondary:
          "border-[var(--portal-line-d5d1c7)] bg-[var(--portal-bg-ebe5da)] text-[var(--portal-text-143f4b)]",
        accent:
          "border-[var(--portal-line-d8a65c)]/40 bg-[var(--portal-bg-fbf4e8)] text-[var(--portal-text-9e6e24)]",
        outline:
          "border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)] text-[var(--portal-text-143f4b)]",
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
