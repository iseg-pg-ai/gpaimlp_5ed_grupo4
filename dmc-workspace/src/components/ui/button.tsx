import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2D5B67] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-[#2D5B67] text-white shadow-xs hover:bg-[#1E4651]",
        ink: "bg-[#143F4B] text-white shadow-xs hover:bg-[#0A242B]",
        gold: "bg-[#D8A65C] text-[#143F4B] font-semibold shadow-xs hover:bg-[#C89547]",
        destructive: "bg-red-700 text-white shadow-xs hover:bg-red-800",
        outline:
          "border border-[#D5D1C7] bg-white text-[#143F4B] hover:bg-[#F4F0E7] hover:border-[#C9C6BD]",
        secondary: "bg-[#E7EEF0] text-[#143F4B] hover:bg-[#D8E4E7]",
        ghost: "hover:bg-[#EAE4D7] text-[#4A636B] hover:text-[#143F4B]",
        link: "text-[#2D5B67] underline-offset-4 hover:underline",
        primaryDark: "bg-[#143F4B] text-[#F4F0E7] shadow-xs hover:bg-[#0A242B]",
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
