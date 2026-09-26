import { type Locale, normalizeLocale, type SupportedLocale } from "@/lib/seo";
import { AR_HOME } from "./home/ar";
import { EN_HOME } from "./home/en";
import { ES_HOME } from "./home/es";
import { FR_HOME } from "./home/fr";
import { JA_HOME } from "./home/ja";
import { KO_HOME } from "./home/ko";
import { RU_HOME } from "./home/ru";
import { ZH_HOME } from "./home/zh";

export {
  AR_HOME,
  EN_HOME,
  ES_HOME,
  FR_HOME,
  JA_HOME,
  KO_HOME,
  RU_HOME,
  ZH_HOME,
};

export type HomeContent = {
  heroEyebrow: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroSubtitle: string;
  primaryCta: string;
  secondaryCta: string;
  statMemos: string;
  statPhotos: string;
  statServers: string;
  statUptime: string;
  featuresBadge: string;
  featuresHeading: string;
  featuresSubtitle: string;
  features: Array<{
    title: string;
    description: string;
  }>;
  comparisonBadge: string;
  comparisonHeading: string;
  comparisonSubtitle: string;
  comparisonRows: Array<{
    label: string;
    cloudflare: string;
    nas: string;
    vps: string;
  }>;
  screenshotsHeading: string;
  screenshotsSubtitle: string;
  faqBadge: string;
  faqHeading: string;
  faqItems: Array<{
    q: string;
    a: string;
  }>;
  ctaBadge: string;
  ctaHeading: string;
  ctaSubtitle: string;
  ctaButton: string;
};

/** Translation completeness guard: every supported locale must be present,
 *  so a locale file that is added (or removed) without touching this map is a
 *  compile error. */
const HOME_BY_LOCALE: Record<SupportedLocale, HomeContent> = {
  en: EN_HOME,
  zh: ZH_HOME,
  ja: JA_HOME,
  fr: FR_HOME,
  es: ES_HOME,
  ko: KO_HOME,
  ru: RU_HOME,
  ar: AR_HOME,
};

export function getHomeContent(locale: Locale): HomeContent {
  const norm = normalizeLocale(locale);
  return HOME_BY_LOCALE[norm] ?? HOME_BY_LOCALE.en;
}
