import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

/** Header with navigation and Sign out around every signed-in page. */
export function Layout() {
  const { state, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <>
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
        <nav aria-label="Main">
          <NavLink to="/" end>
            Expenses
          </NavLink>{" "}
          <NavLink to="/expenses/new">New expense</NavLink>{" "}
          <NavLink to="/archived">Archived</NavLink>{" "}
          <NavLink to="/me">Profile</NavLink>{" "}
          {/* Only hides the link; the server checks the role on every /users call */}
          {state.role === "ADMIN" && (
            <>
              <NavLink to="/admin/users">Admin</NavLink>{" "}
            </>
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
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
