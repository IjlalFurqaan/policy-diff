import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Falls back to a monogram tile: the logo comes from a third-party favicon
 * service and a broken image is a worse look than initials.
 */
export function CompanyLogo({
  name,
  logoUrl,
  size = 36,
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
  className?: string;
}) {
  const classes = cn(
    "shrink-0 rounded-md border border-border bg-background object-contain",
    className,
  );

  if (!logoUrl) {
    return (
      <span
        className={cn(classes, "flex items-center justify-center bg-secondary font-semibold text-secondary-foreground")}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      className={classes}
      unoptimized
    />
  );
}
