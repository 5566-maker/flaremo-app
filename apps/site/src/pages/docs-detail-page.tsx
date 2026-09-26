import { Link, useLocation, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docPath, getDocNavGroups } from "@/content/docs-nav";
import { getDoc, listDocs } from "@/lib/docs-source.generated";
import "@/styles/prose.css";
import { getLocaleFromPath, getLocalizedPath } from "@/lib/seo";

export function DocsDetailPage() {
  const { pathname } = useLocation();
  const { slug: routeSlug } = useParams({ strict: false }) as { slug?: string };
  const locale = getLocaleFromPath(pathname);
  const docLocale = locale === "zh" ? "zh-CN" : "en-US";
  const slug = routeSlug ?? "";

  const doc = useMemo(() => getDoc(slug, docLocale), [slug, docLocale]);
  const allDocs = useMemo(() => listDocs(docLocale), [docLocale]);
  const groups = useMemo(() => getDocNavGroups(locale), [locale]);

  if (!doc) {
    return (
      <main className="container-x py-20 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {locale === "zh" ? "文档不存在" : "Document not found"}
        </h1>
        <p className="mt-2 text-sm text-mist">
          {locale === "zh"
            ? "我们暂时没有这份文档。请查看文档总览。"
            : "We don't have that document. See the docs index."}
        </p>
        <Link
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-signal hover:underline"
          to={getLocalizedPath("/docs", locale)}
        >
          <ChevronLeft className="size-4 rtl:-rotate-180" />
          {locale === "zh" ? "回到文档总览" : "Back to docs"}
        </Link>
      </main>
    );
  }

  return (
    <main className="container-x grid gap-10 py-10 md:py-14 lg:grid-cols-[15rem_1fr]">
      {/* 侧边导航栏 */}
      <aside className="lg:sticky lg:top-20 lg:self-start space-y-6">
        <Link
          className="inline-flex items-center gap-1 text-xs font-semibold text-mist hover:text-ink transition-colors"
          to={getLocalizedPath("/docs", locale)}
        >
          <ChevronLeft className="size-3.5 rtl:-rotate-180" />
          <span>{locale === "zh" ? "文档总览" : "Docs Overview"}</span>
        </Link>

        <nav className="space-y-5">
          {groups.map((group) => {
            const docsInGroup = allDocs.filter((d) => d.group === group.id);
            if (docsInGroup.length === 0) return null;
            return (
              <div key={group.id} className="space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-fog px-2">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {docsInGroup.map((d) => {
                    const isActive = d.slug === slug;
                    return (
                      <li key={d.slug}>
                        <Link
                          className={`block rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                            isActive
                              ? "bg-surface font-bold text-signal-ink shadow-2xs border border-line/60"
                              : "text-mist hover:bg-wash hover:text-ink"
                          }`}
                          to={docPath(d.slug, locale)}
                        >
                          {d.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* 文档主体内容。
          正文只有中文原文与英文两个来源，而页面 <html lang> 跟随界面语言
          （ja/ko/fr/…）。把正文自身的语言标出来，字形与读屏才按内容走：
          中文原文用中文字形，英文译文用拉丁字形——否则日/韩/阿语页面上的
          英文正文会被 Han 字体族接管，中文原文又会被日韩字面重塑。 */}
      <article
        className="min-w-0"
        lang={locale === "zh" || doc.fallbackFromZh ? "zh-CN" : "en-US"}
      >
        {doc.fallbackFromZh ? (
          <div className="mb-6 rounded-xl border border-signal/30 bg-signal/10 px-4 py-3 text-sm text-signal-ink">
            {locale === "zh"
              ? "本页内容为中文原文；尚未翻译为英文。"
              : "This document is shown in its original Chinese; an English translation is pending."}
          </div>
        ) : null}

        <header className="mb-8 space-y-2 border-b border-line/60 pb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-signal">
            {groups.find((g) => g.id === doc.group)?.label}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {doc.title}
          </h1>
        </header>

        <div className="prose-doc">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
        </div>
      </article>
    </main>
  );
}
