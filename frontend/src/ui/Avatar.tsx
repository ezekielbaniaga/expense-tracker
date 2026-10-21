import { hueFor, initials } from "./initials";

interface AvatarProps {
  name: string;
  /** Picks the color by a stable hash; omit to use the signed-in user's accent. */
  id?: string;
  className?: string;
}

/*
 * Initials in a circle. The color is a class chosen by palette index (or the accent),
 * so no user-supplied value ever reaches CSS. The initials are decorative: the name
 * belongs to the control or text next to it.
 */
export function Avatar({ name, id, className }: AvatarProps) {
  const tone = id === undefined ? "avatar--accent" : `avatar--hue-${hueFor(id)}`;
  const classes = ["avatar", tone, className].filter(Boolean).join(" ");
  return (
    <span className={classes} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
