import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * Reading `<option>` children the way a native select does.
 *
 * `SelectField` takes the same children a `<select>` takes, so a caller reads
 * like a select and can be swapped back for one. That means the labels have to
 * be recovered from arbitrary JSX, and the first attempt did it with
 * `children.toString()`. For a single string that works. For anything else —
 * `Urut: {SORT_LABELS[key]}`, which is an array of two nodes — `Array.toString`
 * joins with a comma, and the directory toolbar showed
 * "Urut: ,Terakhir diperbarui" to everybody who looked at it.
 */

export interface SelectOption {
  value: string;
  label: string;
}

interface OptionProps {
  value?: string | number;
  children?: ReactNode;
}

/** All the text inside a node, concatenated, with nothing inserted between. */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as OptionProps).children);
  return "";
}

/**
 * Every `<option>` in the tree, in order.
 *
 * `<optgroup>` and any other wrapper is descended into rather than rejected:
 * the groups are a visual device in a native select, and what this component
 * needs is the flat list of choices.
 */
export function optionsFrom(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  const walk = (nodes: ReactNode): void => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const element = child as ReactElement<OptionProps>;

      if (element.type === "option") {
        const label = textOf(element.props.children);
        // A value of "" is meaningful — it is the "nothing chosen yet" option —
        // so only an absent value falls back to the label.
        const value = element.props.value !== undefined ? String(element.props.value) : label;
        options.push({ value, label: label || value });
        return;
      }

      walk(element.props.children);
    });
  };

  walk(children);
  return options;
}
