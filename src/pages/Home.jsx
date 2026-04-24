import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import PricingSection from '../components/landing/PricingSection';
import FAQSection from '../components/landing/FAQSection';
import CTASection from '../components/landing/CTASection';
import Footer from '../components/landing/Footer';

export default function Home() {
  const navigate = useNavigate();

  function handleLoginSuccess() {
    navigate('/dashboard');
  }

  return (
    <>
      <Helmet>
        <title>Orbit — Deploy to Flux with Git</title>
        <meta
          name="description"
          content="Git-native deployment for the Flux decentralized cloud. Push code, auto-detect framework, deploy globally. Free tier forever."
        />
        <meta property="og:title" content="Orbit — Deploy to Flux with Git" />
        <meta
          property="og:description"
          content="Push your code. Orbit builds and deploys to 10,000+ Flux nodes worldwide."
        />
      </Helmet>

      <div className="bg-background text-text">
        <Navbar onLoginSuccess={handleLoginSuccess} />
        <HeroSection onLoginSuccess={handleLoginSuccess} />
        <HowItWorksSection />
        <FeaturesSection />
        <PricingSection onLoginSuccess={handleLoginSuccess} />
        <FAQSection />
        <CTASection onLoginSuccess={handleLoginSuccess} />
        <Footer />
      </div>
    </>
  );
}
