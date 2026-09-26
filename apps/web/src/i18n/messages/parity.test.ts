// Locale parity gate. `TranslationKey` derives from zh-CN (see ../key.ts), and
// every catalog is type-checked against it — this test is the runtime net for
// the same invariant, so drift is caught even where types are loosened or the
// catalogs are edited dynamically. The app's `t()` falls back to en-US and
// then to the raw key (see src/i18n.tsx), so a drifted locale degrades
// silently; this test makes that degradation loud instead.
import { describe, expect, it } from "vitest";
import { ar } from "./ar";
import { enUS } from "./en-US";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { ko } from "./ko";
import { ru } from "./ru";
import { zhCN } from "./zh-CN";

const CATALOGS = {
  "zh-CN": zhCN,
  "en-US": enUS,
  ja,
  fr,
  es,
  ko,
  ru,
  ar,
} as const;

/** The master catalog that `TranslationKey` is derived from. */
const MASTER = "zh-CN" as const;

function keySet(catalog: Record<string, string>): Set<string> {
  return new Set(Object.keys(catalog));
}

describe("i18n locale key parity", () => {
  it("master catalog is non-empty", () => {
    expect(keySet(CATALOGS[MASTER]).size).toBeGreaterThan(0);
  });

  it("every locale exposes exactly the master key set", () => {
    const masterKeys = keySet(CATALOGS[MASTER]);
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      const keys = keySet(catalog);
      const missing = [...masterKeys].filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !masterKeys.has(key));
      expect(
        { missing, extra },
        `${locale} drifted from ${MASTER}: ${missing.length} missing, ${extra.length} extra`,
      ).toEqual({ missing: [], extra: [] });
    }
  });

  it("no catalog value is empty or whitespace-only", () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(
          value.trim().length,
          `${locale}:${key} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
