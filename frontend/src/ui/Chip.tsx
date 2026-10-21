import type { ReactNode } from "react";
import { categoryLabel } from "../api/expense";
import {
  BusIcon,
  CheckIcon,
  DotIcon,
  ForkKnifeIcon,
  ReceiptIcon,
  TicketIcon,
  type IconProps,
} from "./icons";

/*
 * Chips and the segmented control. Both are native radio or checkbox inputs inside a
 * fieldset, so they submit, tab and announce like any form control. The input is
 * visually hidden and its label is the styled pill. A selected chip shows a check icon
 * and a border as well as the fill, because the fill alone is under 3:1 on the surface.
 */

export interface ChipOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface GroupBase {
  /** The group's accessible name, shown as the fieldset legend. */
  legend: string;
  name: string;
  options: ChipOption[];
  className?: string;
}

type ChipGroupProps = GroupBase &
  (
    | { multiple?: false; value: string; onChange: (value: string) => void }
    | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  );

export function ChipGroup(props: ChipGroupProps) {
  const { legend, name, options, className } = props;
  const classes = ["chip-group", className].filter(Boolean).join(" ");
  const isSelected = (v: string) => (props.multiple ? props.value.includes(v) : props.value === v);

  function toggle(v: string) {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
    }
  }

  return (
    <fieldset className={classes}>
      <legend className="field-label">{legend}</legend>
      <div className="chip-group__items">
        {options.map((o) => {
          const selected = isSelected(o.value);
          return (
            <label key={o.value} className={`chip${selected ? " chip--selected" : ""}`}>
              <input
                className="chip__input"
                type={props.multiple ? "checkbox" : "radio"}
                name={name}
                value={o.value}
                checked={selected}
                disabled={o.disabled}
                onChange={() => toggle(o.value)}
              />
              {selected && <CheckIcon size={16} />}
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface SegmentedControlProps extends GroupBase {
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ legend, name, options, value, onChange, className }: SegmentedControlProps) {
  const classes = ["segmented", className].filter(Boolean).join(" ");
  return (
    <fieldset className={classes}>
      <legend className="field-label">{legend}</legend>
      <div className="segmented__track">
        {options.map((o) => (
          <label
            key={o.value}
            className={`segmented__item${o.value === value ? " segmented__item--selected" : ""}`}
          >
            <input
              className="chip__input"
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const CATEGORY_LOOK: Record<string, { key: string; Icon: (p: IconProps) => ReactNode }> = {
  FOOD: { key: "food", Icon: ForkKnifeIcon },
  TRANSPORT: { key: "transport", Icon: BusIcon },
  BILLS: { key: "bills", Icon: ReceiptIcon },
  ENTERTAINMENT: { key: "entertainment", Icon: TicketIcon },
};

/** Read-only icon + label on the category's fill; neutral with a dot for null or unknown values. */
export function CategoryChip({ category }: { category: string | null }) {
  const look = category === null ? undefined : CATEGORY_LOOK[category];
  const Icon = look?.Icon ?? DotIcon;
  return (
    <span className={`chip chip--category chip--cat-${look?.key ?? "unknown"}`}>
      <Icon size={16} />
      {categoryLabel(category)}
    </span>
  );
}
