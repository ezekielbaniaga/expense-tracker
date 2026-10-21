import type { Role } from "../api/jwt";
import { BanIcon, CheckIcon } from "../ui/icons";

/** Admin in the accent color, User neutral; the text carries the meaning. */
export function RoleChip({ role }: { role: Role }) {
  return <span className={`status-chip ${role === "ADMIN" ? "status-chip--accent" : ""}`}>{role === "ADMIN" ? "Admin" : "User"}</span>;
}

/** Enabled in mint with a check, Disabled neutral with a strike-through icon. */
export function StatusChip({ enabled }: { enabled: boolean }) {
  return (
    <span className={`status-chip ${enabled ? "status-chip--ok" : ""}`}>
      {enabled ? <CheckIcon size={16} /> : <BanIcon size={16} />}
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}
