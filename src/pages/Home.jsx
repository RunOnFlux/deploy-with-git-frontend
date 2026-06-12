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
        <title>Orbit - Deploy to Flux with Git</title>
        <meta
          name="description"
          content="Git-native deployment for the Flux decentralized cloud. Push code, auto-detect framework, deploy globally. Free tier forever."
        />
        <meta property="og:title" content="Orbit - Deploy to Flux with Git" />
        <meta
          property="og:description"
          content="Push your code. Orbit builds and deploys to thousands of Flux nodes worldwide."
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
          <FAQSection />
          <CTASection onLoginSuccess={handleLoginSuccess} />
          <MobileStickyCTA onLoginSuccess={handleLoginSuccess} />
          <Footer />
        </div>
      </MotionConfig>
    </>
  );
}
