import { useState } from "react";
import { useAuth } from "./auth/AuthProvider";

/** Placeholder for the expense list, which a later item builds. */
export function HomePage() {
  const { state, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <main>
      <header>
        <h1>Expense Tracker</h1>
        {state.status === "authenticated" && (
          <p>
            Signed in as <strong>{state.username}</strong>
            {state.role && (
              <>
                {" "}
                (<span>{state.role}</span>)
              </>
            )}
          </p>
        )}
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void logout();
          }}
        >
          Sign out
        </button>
      </header>
    </main>
  );
}
