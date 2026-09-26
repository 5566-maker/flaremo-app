// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoContent } from "./memo-content";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("MemoContent", () => {
  it("renders single newline as <br> via remark-breaks", () => {
    const raw = "第一行\n第二行";
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("第一行<br/>\n第二行");
  });

  it("renders two newlines as distinct paragraphs", () => {
    const raw = "第一段\n\n第二段";
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("<p>第一段</p>\n<p>第二段</p>");
  });
});
