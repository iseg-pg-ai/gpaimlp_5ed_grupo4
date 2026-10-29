// Primitiva de botão com variantes de apresentação partilhadas.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[var(--portal-line-2d5b67)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--portal-bg-2d5b67)] text-white shadow-xs hover:bg-[var(--portal-bg-1e4651)]",
        ink: "bg-[var(--portal-bg-143f4b)] text-white shadow-xs hover:bg-[var(--portal-bg-0a242b)]",
        gold: "bg-[#D8A65C] text-[#143F4B] font-semibold shadow-xs hover:bg-[#C89547]",
        destructive: "bg-red-700 text-white shadow-xs hover:bg-red-800",
        outline:
          "border border-[var(--portal-line-d5d1c7)] bg-[var(--portal-white)] text-[var(--portal-text-143f4b)] hover:bg-[var(--portal-bg-f4f0e7)] hover:border-[var(--portal-line-c9c6bd)]",
        secondary:
          "bg-[var(--portal-bg-e7eef0)] text-[var(--portal-text-143f4b)] hover:bg-[var(--portal-bg-d8e4e7)]",
        ghost:
          "hover:bg-[var(--portal-bg-eae4d7)] text-[var(--portal-text-4a636b)] hover:text-[var(--portal-text-143f4b)]",
        link: "text-[var(--portal-text-2d5b67)] underline-offset-4 hover:underline",
        primaryDark:
          "bg-[var(--portal-bg-143f4b)] text-[#F4F0E7] shadow-xs hover:bg-[var(--portal-bg-0a242b)]",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-7 rounded-md px-2.5 text-[11px]",
        lg: "h-11 rounded-xl px-5 text-sm",
        icon: "h-8 w-8",
        iconSm: "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button };
