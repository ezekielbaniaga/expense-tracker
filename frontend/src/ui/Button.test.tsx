import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "./Button";
import { PlusIcon } from "./icons";

describe("Button", () => {
  it("renders a native button with the variant and size classes", () => {
    render(
      <Button variant="primary" size="sm">
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button?.getAttribute("type")).toBe("button");
    expect(button.classList.contains("btn")).toBe(true);
expect(button.classList.contains("btn--primary")).toBe(true);
expect(button.classList.contains("btn--sm")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("while pending is busy and disabled but keeps its label", () => {
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button?.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector(".spinner")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("can submit a form", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Go</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("IconButton", () => {
  it("is named by its label and hides the icon", () => {
    render(
      <IconButton label="Add expense">
        <PlusIcon />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Add expense" });
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
