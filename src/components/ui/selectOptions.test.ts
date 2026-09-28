import { createElement, type ReactNode } from "react";

import { describe, expect, it } from "vitest";

import { optionsFrom, textOf } from "./selectOptions";

/**
 * Reading the labels off `<option>` children.
 *
 * The case that made this its own module: the directory toolbar writes
 * `Urut: {SORT_LABELS[key]}`, which React hands over as an array of two nodes.
 * Read with `toString()`, that displayed as "Urut: ,Terakhir diperbarui".
 */

const option = (value: string | undefined, ...children: ReactNode[]) =>
  createElement("option", { value, key: value ?? String(children[0]) }, ...children);

describe("reading option labels", () => {
  it("joins a label split across several nodes, with nothing inserted", () => {
    const options = optionsFrom([option("updated", "Urut: ", "Terakhir diperbarui")]);

    expect(options).toEqual([{ value: "updated", label: "Urut: Terakhir diperbarui" }]);
  });

  it("reads a plain label", () => {
    expect(optionsFrom([option("name", "Nama")])).toEqual([{ value: "name", label: "Nama" }]);
  });

  it("keeps an empty value, which is the 'nothing chosen' option", () => {
    const options = optionsFrom([option("", "Pilih manager…"), option("yoga", "Yoga Pratama")]);

    expect(options).toEqual([
      { value: "", label: "Pilih manager…" },
      { value: "yoga", label: "Yoga Pratama" },
    ]);
  });

  it("falls back to the label when no value is given", () => {
    expect(optionsFrom([option(undefined, "Finance")])).toEqual([
      { value: "Finance", label: "Finance" },
    ]);
  });

  it("descends into optgroups, flattening them in order", () => {
    const tree = [
      createElement(
        "optgroup",
        { label: "Engineering", key: "e" },
        option("be", "Backend Engineer"),
        option("fe", "Frontend Engineer"),
      ),
      createElement("optgroup", { label: "Finance", key: "f" }, option("acc", "Accountant")),
    ];

    expect(optionsFrom(tree).map((entry) => entry.value)).toEqual(["be", "fe", "acc"]);
  });

  it("ignores what is not an option and survives holes", () => {
    const options = optionsFrom([null, false, undefined, option("x", "Ada"), "teks lepas"]);

    expect(options).toEqual([{ value: "x", label: "Ada" }]);
  });

  it("reads through nested elements and numbers", () => {
    const label = createElement("span", null, "Sisa ", 3, " hari");

    expect(textOf(label)).toBe("Sisa 3 hari");
  });
});
