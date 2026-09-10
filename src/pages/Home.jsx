import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import FrameworkLogosSection from '../components/landing/FrameworkLogosSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import DeployToFluxSection from '../components/landing/DeployToFluxSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import ComparisonSection from '../components/landing/ComparisonSection';
import GlobalNetworkSection from '../components/landing/GlobalNetworkSection';
import PricingSection from '../components/landing/PricingSection';
import FAQSection from '../components/landing/FAQSection';
import RelatedLinksSection from '../components/landing/RelatedLinksSection';
import CTASection from '../components/landing/CTASection';
import MobileStickyCTA from '../components/landing/MobileStickyCTA';
import Footer from '../components/landing/Footer';
import { FREE_PLAN_AVAILABLE } from '../config/offer';

const HOME_DESCRIPTION = FREE_PLAN_AVAILABLE
  ? 'Deploy any Git repo to the Flux decentralized cloud. Orbit auto-detects your framework and ships to global nodes. Start free, with paid plans from $0.99/mo.'
  : 'Deploy any Git repo to the Flux decentralized cloud. Orbit auto-detects your framework and ships to global nodes. Plans from $0.99/mo.';

const DEPLOY_LINK_PARAMS = ['repo', 'repolink', 'repository'];

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Deep links like /?repo=...&plan=custom → /deploy (auth gateway → wizard)
  useEffect(() => {
    const hasDeployLink = DEPLOY_LINK_PARAMS.some((key) => searchParams.get(key)?.trim());
    if (hasDeployLink) {
      navigate(`/deploy?${searchParams.toString()}`, { replace: true });
    }
  }, [navigate, searchParams]);

  // Landing page is always dark regardless of user's theme preference.
  // Restore the user's chosen theme when they leave.
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev);
    };
  }, []);

  // No `handleLoginSuccess` any more. It was handed to Navbar, PricingSection, CTASection and
  // MobileStickyCTA, and not one of them called it — they navigate to /login themselves, which
  // is where the redirect after signing in is decided. A callback four components take and none
  // uses is worse than none: it reads as a wired-up flow.

  return (
    <>
      <Helmet>
        <title>Deploy with Git to the Flux Decentralized Cloud | Orbit</title>
        <meta
          name="description"
          content={HOME_DESCRIPTION}
        />
        <meta property="og:title" content="Deploy with Git to the Flux Decentralized Cloud | Orbit" />
        <meta
          property="og:description"
          content={HOME_DESCRIPTION}
        />
      </Helmet>

      <MotionConfig reducedMotion="user">
        <div className="bg-background text-text pb-20 sm:pb-0">
          <Navbar />
          <HeroSection />
          <FrameworkLogosSection />
          <HowItWorksSection />
          <DeployToFluxSection />
          <FeaturesSection />
          <ComparisonSection />
          <GlobalNetworkSection />
          <PricingSection />
          <div className="px-6 -mt-8 lg:-mt-12 mb-4">
            <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-surface border border-primary/30 shadow-lg shadow-primary/10">
              <div className="text-center sm:text-left">
                <p className="text-lg font-semibold text-text">Weighing your options?</p>
                <p className="text-sm text-text-secondary">See exactly how Orbit stacks up against the big centralized platforms.</p>
              </div>
              <a
                href="/vercel-netlify-alternative"
                className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow"
              >
                See how Orbit compares to Vercel &amp; Netlify
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
          <FAQSection />
          <RelatedLinksSection />
          <CTASection />
          <MobileStickyCTA />
          <Footer />
        </div>
      </MotionConfig>
    </>
  );
}
