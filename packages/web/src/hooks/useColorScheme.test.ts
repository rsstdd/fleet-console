import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useColorScheme } from "@/hooks/useColorScheme";

function stubSystemScheme(prefersDark: boolean): void {
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: prefersDark && query.includes("dark"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe("useColorScheme", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("follows the system preference when the viewer has not chosen", () => {
    stubSystemScheme(true);
    const { result } = renderHook(() => useColorScheme());
    expect(result.current.scheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("remembers an explicit choice over the system preference", () => {
    stubSystemScheme(true);
    const { result } = renderHook(() => useColorScheme());
    act(() => {
      result.current.toggle();
    });

    expect(result.current.scheme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(globalThis.localStorage.getItem("fleet-console-theme")).toBe("light");
  });

  it("restores a remembered choice on the next visit", () => {
    globalThis.localStorage.setItem("fleet-console-theme", "dark");
    stubSystemScheme(false);
    const { result } = renderHook(() => useColorScheme());
    expect(result.current.scheme).toBe("dark");
  });
});
