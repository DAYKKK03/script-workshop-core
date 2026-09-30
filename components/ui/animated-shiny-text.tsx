import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

type AnimatedShinyTextProps = {
  children: ReactNode;
  className?: string;
  shimmerWidth?: number;
};

export function AnimatedShinyText({
  children,
  className,
  shimmerWidth = 96
}: AnimatedShinyTextProps) {
  return (
    <span
      style={
        {
          "--shiny-width": `${shimmerWidth}px`
        } as CSSProperties
      }
      className={cn(
        "animate-shiny-text bg-[linear-gradient(110deg,transparent,rgba(255,177,74,0.92)_45%,rgba(255,255,255,0.96)_50%,rgba(255,122,26,0.92)_55%,transparent)] bg-clip-text bg-no-repeat text-transparent [background-position:calc(-100%-var(--shiny-width))_0] [background-size:var(--shiny-width)_100%]",
        className
      )}
    >
      {children}
    </span>
  );
}
