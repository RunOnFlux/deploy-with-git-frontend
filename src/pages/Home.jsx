import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import FrameworkLogosSection from '../components/landing/FrameworkLogosSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import ComparisonSection from '../components/landing/ComparisonSection';
import GlobalNetworkSection from '../components/landing/GlobalNetworkSection';
import PricingSection from '../components/landing/PricingSection';
import FAQSection from '../components/landing/FAQSection';
import RelatedLinksSection from '../components/landing/RelatedLinksSection';
import CTASection from '../components/landing/CTASection';
import MobileStickyCTA from '../components/landing/MobileStickyCTA';
import Footer from '../components/landing/Footer';

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

  function handleLoginSuccess() {
    navigate('/dashboard');
  }

  return (
    <>
      <Helmet>
        <title>Deploy with Git to the Flux Decentralized Cloud | Orbit</title>
        <meta
          name="description"
          content="Deploy any Git repo to the Flux decentralized cloud. Orbit auto-detects your framework and ships to global nodes — free tier, paid plans from $0.99/mo."
        />
        <meta property="og:title" content="Deploy with Git to the Flux Decentralized Cloud | Orbit" />
        <meta
          property="og:description"
          content="Deploy any Git repo to the Flux decentralized cloud. Orbit auto-detects your framework and ships to global nodes — free tier, paid plans from $0.99/mo."
        />
      </Helmet>

      <MotionConfig reducedMotion="user">
        <div className="bg-background text-text pb-20 sm:pb-0">
          <Navbar onLoginSuccess={handleLoginSuccess} />
          <HeroSection />
          <FrameworkLogosSection />
          <HowItWorksSection />
          <FeaturesSection />
          <ComparisonSection />
          <GlobalNetworkSection />
          <PricingSection onLoginSuccess={handleLoginSuccess} />
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
          <CTASection onLoginSuccess={handleLoginSuccess} />
          <MobileStickyCTA onLoginSuccess={handleLoginSuccess} />
          <Footer />
        </div>
      </MotionConfig>
    </>
  );
}
