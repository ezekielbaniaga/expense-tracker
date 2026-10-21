import { useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "./Button";
import { ErrorBoundary } from "./ErrorBoundary";
import { ArchiveIcon, ListIcon, PlusIcon, ShieldIcon, UserIcon } from "./icons";

/** Top bar, the one main nav and Sign out around every signed-in page. */
export function Layout() {
  const { state, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  return (
    <>
      {/* Not a #main link: the router would put the hash in the URL */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="topbar__name">
          Expense Tracker
        </Link>
        <NavLink to="/expenses/new" className="btn btn--primary add-expense">
          <PlusIcon />
          <span>Add expense</span>
        </NavLink>
        {/* One nav for every size: CSS makes it the bottom tab bar on phones and inline in the bar on wide screens */}
        <nav aria-label="Main" className="main-nav">
          <NavLink to="/" end>
            <ListIcon />
            <span>Expenses</span>
          </NavLink>
          <NavLink to="/archived">
            <ArchiveIcon />
            <span>Archived</span>
          </NavLink>
          <NavLink to="/me">
            <UserIcon />
            <span>Profile</span>
          </NavLink>
          {/* Only hides the link; the server checks the role on every /users call */}
          {state.role === "ADMIN" && (
            <NavLink to="/admin/users">
              <ShieldIcon />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>
        <div className="topbar__account">
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
          <Button
            size="sm"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void logout();
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </>
  );
}
