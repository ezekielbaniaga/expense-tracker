import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AccountMenu } from "./AccountMenu";
import { ErrorBoundary } from "./ErrorBoundary";
import { ArchiveIcon, ListIcon, PlusIcon, ShieldIcon, UserIcon } from "./icons";

/** Top bar, the one main nav and account menu around every signed-in page. */
export function Layout() {
  const { state } = useAuth();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // The bar only gets its edge once content has scrolled under it
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);
  // On phones the button floats over the list only; from 48rem it stays in the top bar on every page
  const onList = pathname === "/";
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
      {/* 1px marker at the page top: out of view means the page has scrolled */}
      <div ref={sentinel} className="topbar-sentinel" aria-hidden="true" />
      <header className="topbar" data-scrolled={scrolled ? "true" : undefined}>
        <Link to="/" className="topbar__name">
          Expense Tracker
        </Link>
        <NavLink to="/expenses/new" className={`btn btn--primary add-expense${onList ? "" : " add-expense--list-only"}`}>
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
          <AccountMenu />
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className={onList ? "main--fab" : undefined}>
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </>
  );
}
