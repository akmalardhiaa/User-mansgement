import { describe, expect, it } from "vitest";

import {
  COMPANY_EMAIL_DOMAINS,
  companyEmailLocalPart,
  employmentDigit,
  splitCompanyEmail,
} from "./companyEmail";

/**
 * The company writes an address as the two names run together with the
 * employment digit on the end. These pin down the suggestion the form makes.
 */

describe("the suggested address", () => {
  it("runs the names together and ends with the kind's digit", () => {
    expect(companyEmailLocalPart("Nadia", "Kusuma", "PERMANENT")).toBe("nadiakusuma1");
    expect(companyEmailLocalPart("Budi", "Santoso", "CONTRACT")).toBe("budisantoso3");
  });

  it("drops spaces, punctuation and accents rather than encoding them", () => {
    // A dot inserted for a space would make two people with the same name
    // differ by punctuation, which nobody notices when typing from memory.
    expect(companyEmailLocalPart("Ayu Dwi", "Prameswari-Putri", "PERMANENT")).toBe(
      "ayudwiprameswariputri1",
    );
    expect(companyEmailLocalPart("José", "Núñez", "PERMANENT")).toBe("josenunez1");
  });

  it("suggests nothing when there is no name yet", () => {
    expect(companyEmailLocalPart("", "", "PERMANENT")).toBe("");
  });

  it("uses the first digit of each range", () => {
    expect(employmentDigit("PERMANENT")).toBe("1");
    expect(employmentDigit("CONTRACT")).toBe("3");
  });
});

describe("reading a stored address back into the form", () => {
  it("splits at the last @, so the domain is the domain", () => {
    expect(splitCompanyEmail("nadiakusuma1@mansek.co.id")).toEqual({
      local: "nadiakusuma1",
      domain: "@mansek.co.id",
    });
  });

  it("falls back to the first domain when there is no @ at all", () => {
    expect(splitCompanyEmail("nadiakusuma1")).toEqual({
      local: "nadiakusuma1",
      domain: COMPANY_EMAIL_DOMAINS[0],
    });
  });
});
