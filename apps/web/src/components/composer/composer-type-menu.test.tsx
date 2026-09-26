// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ComposerTypeMenu } from "./composer-type-menu";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("ComposerTypeMenu", () => {
  it("renders trigger with memo label when type is memo", () => {
    const html = renderToStaticMarkup(
      <ComposerTypeMenu type="memo" onTypeChange={() => undefined} />,
    );
    expect(html).toContain("composer.type.memo");
  });

  it("renders trigger with article label and active style when type is article", () => {
    const html = renderToStaticMarkup(
      <ComposerTypeMenu type="article" onTypeChange={() => undefined} />,
    );
    expect(html).toContain("composer.type.article");
    expect(html).toContain("border-brand-500/40");
  });
});
