import { useEffect, useRef, type ComponentProps } from "react";
import { useLocation } from "react-router-dom";

/**
 * The heading of a page, the one h1 (the bar's app name is a link). After a navigation it takes focus, so a screen reader
 * announces the new page and the next Tab starts at its top. The first page
 * after a full load keeps the browser's own focus (its location key is "default").
 */
export function PageHeading({ as: Tag = "h1", ...props }: { as?: "h1" | "h2" } & ComponentProps<"h2">) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();
  useEffect(() => {
    if (key !== "default") ref.current?.focus();
    // On mount only: a refetch or a re-render must not pull focus back
  }, []);
  return <Tag ref={ref} tabIndex={-1} {...props} />;
}

/**
 * For a button that is swapped for a confirm panel: focuses the button again
 * once the panel is gone, so keyboard users do not land on the page start.
 */
export function useRefocusOnClose<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return ref;
}
