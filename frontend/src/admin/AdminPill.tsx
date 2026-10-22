import { ShieldIcon } from "../ui/icons";

/** Marks the admin pages, so it is obvious you are acting on other users. */
export function AdminPill() {
  return (
    <span className="admin-pill">
      <ShieldIcon size={16} />
      Admin area
    </span>
  );
}
