import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoginModal from '../auth/LoginModal';
import BokehBackground, { BOKEH_CTA } from './BokehBackground';

export default function CTASection({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  function handleCTA() {
    if (isAuthenticated) {
      window.location.href = '/dashboard';
    } else {
      setLoginOpen(true);
    }
  }

  return (
    <>
      <section className="relative py-24 px-6 overflow-hidden">
        <BokehBackground orbs={BOKEH_CTA} />
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="relative rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-accent/5 p-12 text-center overflow-hidden"
          >
            {/* Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative z-10">
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text mb-4">
                Start deploying in minutes
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto mb-8">
                Free tier forever. No credit card required. Your first paid month is on us.
              </p>
              <button
                onClick={handleCTA}
                className="btn-cta text-base px-8 py-3.5"
              >
                Get started free
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          onLoginSuccess?.();
        }}
      />
    </>
  );
}
