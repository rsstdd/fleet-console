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
function getToggleGroup(): HTMLElement {
  return screen.getByRole("group", { name: "View persona" });
}

function getPersonaButton(name: "Operator" | "Technician"): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("PersonaToggle", () => {
  it("names the group and exposes exactly one pressed option", () => {
    render(<PersonaToggle value="operator" onChange={vi.fn()} />);

    expect(getToggleGroup()).toBeInTheDocument();
    expect(getPersonaButton("Operator")).toHaveAttribute("aria-pressed", "true");
    expect(getPersonaButton("Technician")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the newly selected persona", async () => {
    const onChange = vi.fn();
    render(<PersonaToggle value="operator" onChange={onChange} />);

    await userEvent.click(getPersonaButton("Technician"));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("technician");
  });

  it("ignores a deselect attempt on the already selected persona", async () => {
    const onChange = vi.fn();
    render(<PersonaToggle value="operator" onChange={onChange} />);

    await userEvent.click(getPersonaButton("Operator"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("is operable by keyboard and keeps focus on the toggle across the change", async () => {
    const onChange = vi.fn();
    render(<PersonaToggle value="operator" onChange={onChange} />);

    // Roving tabindex: one Tab reaches the group at the selected button, arrows
    // move within it, and a further Tab leaves the group entirely (spec 08 section 8).
    await userEvent.tab();
    expect(getPersonaButton("Operator")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowRight}");
    expect(getPersonaButton("Technician")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("technician");
    // Persona change reveals sections after the toggle, so focus must stay put.
    expect(getPersonaButton("Technician")).toHaveFocus();

    await userEvent.tab();
    expect(getPersonaButton("Operator")).not.toHaveFocus();
    expect(getPersonaButton("Technician")).not.toHaveFocus();
  });

  it("forwards disabled to every button in the rendered group", () => {
    render(<PersonaToggle value="operator" onChange={vi.fn()} isDisabled />);

    expect(getPersonaButton("Operator")).toBeDisabled();
    expect(getPersonaButton("Technician")).toBeDisabled();
  });

  it("appends the caller class to the group", () => {
    render(
      <PersonaToggle value="technician" onChange={vi.fn()} className="detail-header__toggle" />,
    );

    expect(getToggleGroup()).toHaveClass("detail-header__toggle");
  });
});
