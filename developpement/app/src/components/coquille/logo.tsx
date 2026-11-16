import Image from "next/image";

import { cn } from "@/lib/utils";
import logo from "@/assets/logo-keitala-negoce.png";

/** Logo de l'entreprise (fond transparent). La hauteur se règle par `className`. */
export function Logo({ className, prioritaire }: { className?: string; prioritaire?: boolean }) {
  return (
    <Image
      src={logo}
      alt="Keitala Négoce"
      priority={prioritaire}
      className={cn("h-8 w-auto", className)}
      sizes="160px"
    />
  );
}
