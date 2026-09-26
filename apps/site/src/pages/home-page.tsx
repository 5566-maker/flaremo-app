import { useLocation } from "@tanstack/react-router";
import {
  Bot,
  Database,
  Layers,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
import { CardGallerySection } from "@/components/card-gallery-section";
import { InteractiveShowcase } from "@/components/interactive-showcase";
import { getHomeContent } from "@/content/copy";
import { getLocaleFromPath } from "@/lib/seo";
import { BentoFeatures } from "./home/bento-features-section";
import { ComparisonSection } from "./home/comparison-section";
import { CtaSection } from "./home/cta-section";
import { EcosystemSection } from "./home/ecosystem-section";
import { FaqSection } from "./home/faq-section";
import { Hero } from "./home/hero-section";

const FEATURE_ICONS = [ShieldCheck, Database, WifiOff, Bot, Users, Layers];

export function HomePage() {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname);
  const home = getHomeContent(locale);

  return (
    <main className="space-y-24 sm:space-y-32 pb-24 overflow-x-hidden">
      <Hero home={home} locale={locale} />
      <InteractiveShowcase locale={locale} />
      <BentoFeatures
        badge={home.featuresBadge}
        heading={home.featuresHeading}
        icons={FEATURE_ICONS}
        items={home.features}
        subtitle={home.featuresSubtitle}
      />
      <ComparisonSection
        heading={home.comparisonHeading}
        locale={locale}
        rows={home.comparisonRows}
        subtitle={home.comparisonSubtitle}
      />
      <EcosystemSection locale={locale} />
      <CardGallerySection locale={locale} />
      <FaqSection
        badge={home.faqBadge}
        heading={home.faqHeading}
        items={home.faqItems}
      />
      <CtaSection
        badge={home.ctaBadge}
        buttonText={home.ctaButton}
        heading={home.ctaHeading}
        locale={locale}
        secondaryCta={home.secondaryCta}
        subtitle={home.ctaSubtitle}
      />
    </main>
  );
}
