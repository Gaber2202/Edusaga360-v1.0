import * as React from "react"

import { cn } from '../../lib/utils'

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-[10px] border border-[color:var(--es-border)] bg-[#FDFBF6] dark:bg-forest-100 px-3 py-2 text-[15px] text-ink shadow-none transition-colors duration-state ease-brand file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-forest-700 focus-visible:ring-[3px] focus-visible:ring-forest-700/10 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
