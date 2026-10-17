import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the home heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Expense Tracker" })).toBeTruthy();
  });
});
