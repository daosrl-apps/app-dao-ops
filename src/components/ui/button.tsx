/**
 * Button base — patrón shadcn (Radix Slot + cva). Las variantes están pensadas
 * para tablets en planta: `keypad` da 88×88+ px y feedback táctil claro.
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium select-none transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl",
        outline: "border border-input bg-background hover:bg-muted rounded-xl",
        ghost: "hover:bg-muted rounded-xl",
        keypad:
          "bg-card text-foreground border border-border hover:bg-muted active:bg-muted/70 rounded-2xl shadow-sm",
      },
      size: {
        default: "h-11 px-5 text-base",
        lg: "h-14 px-7 text-lg",
        xl: "h-20 px-8 text-xl",
        keypad: "h-24 w-24 text-4xl md:h-28 md:w-28 md:text-5xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { buttonVariants };
