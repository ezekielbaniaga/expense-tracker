import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("keeps the loading text in a status region and hides the blocks", () => {
    const { container } = render(<Skeleton label="Loading things..." lines={2} />);
    expect(screen.getByRole("status").textContent).toBe("Loading things...");
    const blocks = container.querySelectorAll(".skeleton__line");
    expect(blocks).toHaveLength(2);
    blocks.forEach((b) => expect(b.getAttribute("aria-hidden")).toBe("true"));
  });
});

describe("EmptyState", () => {
  it("shows headline, text and action, with the art hidden from assistive tech", () => {
    const { container } = render(
      <EmptyState title="Nothing here" action={<button>Go</button>}>
        Some text
      </EmptyState>,
    );
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByText("Some text")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Card", () => {
  it("renders an optional title and its children", () => {
    render(
      <Card title="Totals">
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Totals" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });
});
