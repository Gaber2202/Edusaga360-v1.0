import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-forest-100 text-forest-700",
        secondary:
          "border-transparent bg-sand-alt text-ink",
        destructive:
          "border-transparent bg-[#F8E8E6] text-[#A8443A]",
        outline: "text-foreground",
        warn:
          "border-transparent bg-[#F8EEDF] text-[#D08A24]",
        gold:
          "border-transparent bg-[#F4EBD4] text-gold-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
