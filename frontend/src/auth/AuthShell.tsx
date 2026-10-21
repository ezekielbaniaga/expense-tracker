import type { ReactNode } from "react";
import { Card } from "../ui/Card";

/** The signed-out page frame: name and tagline over a centred card, on the blobbed background. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__brand">
        <p className="auth__name">Expense Tracker</p>
        <p className="auth__tagline">Track what you spend, nothing more.</p>
      </div>
      <Card className="auth__card">{children}</Card>
    </main>
  );
}
