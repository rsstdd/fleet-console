import { useCallback, useEffect, useState } from "react";
import type { ColorScheme } from "@/app/theme";

const STORAGE_KEY = "fleet-console-theme";

function systemScheme(): ColorScheme {
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedScheme(): ColorScheme | null {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // Private browsing and blocked site data both throw; the system preference still works.
    return null;
  }
}

/** Follows the system until the viewer chooses, then remembers that choice on this device. */
export function useColorScheme(): { scheme: ColorScheme; toggle: () => void } {
  const [scheme, setScheme] = useState<ColorScheme>(() => storedScheme() ?? systemScheme());

  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
  }, [scheme]);

  useEffect(() => {
    if (storedScheme() !== null) {
      return undefined;
    }
    const query = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      setScheme(systemScheme());
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    setScheme((current) => {
      const next: ColorScheme = current === "dark" ? "light" : "dark";
      try {
        globalThis.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Remembering the choice is a convenience; the toggle still works without it.
      }
      return next;
    });
  }, []);

  return { scheme, toggle };
}
