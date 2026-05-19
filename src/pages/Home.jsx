import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import FrameworkLogosSection from '../components/landing/FrameworkLogosSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import ComparisonSection from '../components/landing/ComparisonSection';
import PricingSection from '../components/landing/PricingSection';
import FAQSection from '../components/landing/FAQSection';
import CTASection from '../components/landing/CTASection';
import MobileStickyCTA from '../components/landing/MobileStickyCTA';
import Footer from '../components/landing/Footer';

export default function Home() {
  const navigate = useNavigate();

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
          content="Push your code. Orbit builds and deploys to 10,000+ Flux nodes worldwide."
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
