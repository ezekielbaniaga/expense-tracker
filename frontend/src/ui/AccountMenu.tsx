import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RoleChip } from "../admin/UserChips";
import { useAuth } from "../auth/AuthProvider";
import { useCachedMe } from "../profile/useMe";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { SegmentedControl } from "./Chip";
import { MonitorIcon, ShieldIcon, UserIcon } from "./icons";
import { usePreferences } from "./preferences";
import { ACCENTS, THEMES, type Accent, type Theme } from "./theme";

export const THEME_OPTIONS = THEMES.map((t) => ({
  value: t,
  label: t[0].toUpperCase() + t.slice(1),
}));

/**
 * Avatar button that discloses the account panel: who is signed in, links, appearance and
 * Sign out. A disclosure (aria-expanded + labelled region), not an ARIA menu, because it
 * holds radio groups. Escape and a click outside close it and return focus to the button.
 */
export function AccountMenu() {
  const { state, logout } = useAuth();
  const prefs = usePreferences();
  // Only reads the cache; the shell never fetches /users/me. Profile fills it.
  const avatarName = useCachedMe()?.displayName;
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  if (state.status !== "authenticated") return null;
  const { username, role } = state;
  const close = () => setOpen(false);

  return (
    <div className="account-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="account-menu__button"
        aria-label={`Account menu for ${username}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={avatarName ?? username} />
      </button>
      {open && (
        <div
          className="account-menu__backdrop"
          aria-hidden="true"
          onClick={close}
        />
      )}
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headingId}
          className="account-menu__panel"
        >
          <div className="account-menu__who">
            <Avatar name={avatarName ?? username} />
            <div>
              <strong id={headingId}>{username}</strong>
              {role && (
                <p className="account-menu__role">
                  <RoleChip role={role} />
                </p>
              )}
            </div>
          </div>
          <ul className="account-menu__links">
            <li>
              <Link to="/me" onClick={close}>
                <UserIcon />
                <span>Profile</span>
              </Link>
            </li>
            <li>
              <Link to="/me#devices" onClick={close}>
                <MonitorIcon />
                <span>Your devices</span>
              </Link>
            </li>
            {/* Only hides the link; the server checks the role on every /users call */}
            {role === "ADMIN" && (
              <li>
                <Link to="/admin/users" onClick={close}>
                  <ShieldIcon />
                  <span>Admin</span>
                </Link>
              </li>
            )}
          </ul>
          <SegmentedControl
            legend="Appearance"
            name="account-theme"
            options={THEME_OPTIONS}
            value={prefs.theme}
            onChange={(v) => prefs.setTheme(v as Theme)}
          />
          <fieldset className="swatches">
            <legend className="field-label">Accent</legend>
            <div className="swatches__row">
              {ACCENTS.map((a: Accent) => (
                <label
                  key={a}
                  className={`swatch swatch--${a}${prefs.accent === a ? " swatch--selected" : ""}`}
                >
                  <input
                    className="swatch__input"
                    type="radio"
                    name="account-accent"
                    value={a}
                    checked={prefs.accent === a}
                    aria-label={a[0].toUpperCase() + a.slice(1)}
                    onChange={() => prefs.setAccent(a)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
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
          <Button
            size="sm"
            className="account-menu__close"
            onClick={() => {
              close();
              button.current?.focus();
            }}
          >
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
