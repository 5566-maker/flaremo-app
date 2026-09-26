import type { SupportedLocale } from "@/lib/seo";
import { AR_SHOWCASE } from "./showcase/ar";
import { EN_SHOWCASE } from "./showcase/en";
import { ES_SHOWCASE } from "./showcase/es";
import { FR_SHOWCASE } from "./showcase/fr";
import { JA_SHOWCASE } from "./showcase/ja";
import { KO_SHOWCASE } from "./showcase/ko";
import { RU_SHOWCASE } from "./showcase/ru";
import { ZH_SHOWCASE } from "./showcase/zh";

export {
  AR_SHOWCASE,
  EN_SHOWCASE,
  ES_SHOWCASE,
  FR_SHOWCASE,
  JA_SHOWCASE,
  KO_SHOWCASE,
  RU_SHOWCASE,
  ZH_SHOWCASE,
};

export type ShowcaseContent = {
  memo1: {
    title: string;
    content: string;
    quote: string;
    tags: string[];
    time: string;
  };
  memo2: {
    title: string;
    content: string;
    tags: string[];
    time: string;
  };
  presets: Array<{
    text: string;
    title: string;
    quote: string;
    tag: string;
  }>;
  ui: {
    statsRecords: string;
    statsTags: string;
    statsDays: string;
    trend: string;
    calendar: string;
    timeline: string;
    archive: string;
    trash: string;
    dailyReview: string;
    randomWalk: string;
    memory: string;
    calendarView: string;
    projects: string;
    tagIndex: string;
    searchPlaceholder: string;
    composerPlaceholder: string;
    send: string;
    justNow: string;
    clearFilter: string;
    recordPrefix: string;
    months: [string, string, string, string];
    tags: Array<{ name: string; count: number }>;
  };
};

/** Translation completeness guard: every supported locale must be present,
 *  so a locale file that is added (or removed) without touching this map is a
 *  compile error. */
export const SHOWCASE_I18N: Record<SupportedLocale, ShowcaseContent> = {
  en: EN_SHOWCASE,
  zh: ZH_SHOWCASE,
  ja: JA_SHOWCASE,
  fr: FR_SHOWCASE,
  es: ES_SHOWCASE,
  ko: KO_SHOWCASE,
  ru: RU_SHOWCASE,
  ar: AR_SHOWCASE,
};
