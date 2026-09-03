import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PersonaToggle } from "./personaToggle";

/**
 * Contract test for docs/02_component-specs/08_PERSONA_TOGGLE.md §11. The
 * load-bearing cases are the deselect attempt (an exclusive group must always
 * have a value, so MUI's null must not reach the caller) and keyboard
 * operability with focus retained across a persona change (Principle 6).
 */
function group(): HTMLElement {
  return screen.getByRole("group", { name: "View persona" });
}

function button(name: "Operator" | "Technician"): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("PersonaToggle", () => {
  it("names the group and exposes exactly one pressed option", () => {
    render(<PersonaToggle value="operator" onChange={vi.fn()} />);

    expect(group()).toBeInTheDocument();
    expect(button("Operator")).toHaveAttribute("aria-pressed", "true");
    expect(button("Technician")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the newly selected persona", async () => {
    const onChange = vi.fn();
    render(<PersonaToggle value="operator" onChange={onChange} />);

    await userEvent.click(button("Technician"));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("technician");
  });

  it("ignores a deselect attempt on the already selected persona", async () => {
    const onChange = vi.fn();
    render(<PersonaToggle value="operator" onChange={onChange} />);

    await userEvent.click(button("Operator"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("is operable by keyboard and keeps focus on the toggle across the change", async () => {
    const onChange = vi.fn();
    render(<PersonaToggle value="operator" onChange={onChange} />);

    // Roving tabindex: one Tab reaches the group at the selected button, arrows
    // move within it, and a further Tab leaves the group entirely (spec 08 section 8).
    await userEvent.tab();
    expect(button("Operator")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowRight}");
    expect(button("Technician")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("technician");
    // Persona change reveals sections after the toggle, so focus must stay put.
    expect(button("Technician")).toHaveFocus();

    await userEvent.tab();
    expect(button("Operator")).not.toHaveFocus();
    expect(button("Technician")).not.toHaveFocus();
  });

  it("forwards disabled to every button in the rendered group", () => {
    render(<PersonaToggle value="operator" onChange={vi.fn()} disabled />);

    expect(button("Operator")).toBeDisabled();
    expect(button("Technician")).toBeDisabled();
  });

  it("appends the caller class to the group", () => {
    render(
      <PersonaToggle value="technician" onChange={vi.fn()} className="detail-header__toggle" />,
    );

    expect(group()).toHaveClass("detail-header__toggle");
  });
});
