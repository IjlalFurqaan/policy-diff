import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal `asChild` implementation.
 *
 * `@radix-ui/react-slot` calls `createContext` at module scope, which makes any
 * component that imports it client-only — an expensive boundary for a button
 * that renders no interactivity of its own. This does the one thing the
 * `asChild` prop needs: merge props onto the single child element.
 */
export function Slot({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  if (!React.isValidElement(children)) return null;

  const child = children as React.ReactElement<Record<string, unknown>>;
  const childProps = child.props;

  return React.cloneElement(child, {
    ...props,
    ...childProps,
    className: cn(className, childProps.className as string | undefined),
    style: {
      ...(props.style ?? {}),
      ...((childProps.style as React.CSSProperties | undefined) ?? {}),
    },
  });
}
