import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest only auto-cleans with `globals: true`; this keeps renders isolated without it.
afterEach(cleanup);
