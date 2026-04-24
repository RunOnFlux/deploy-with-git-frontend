import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { ORBIT_PLANS } from '../../config/plans';
import LoginModal from '../auth/LoginModal';

const PLAN_FEATURES = {
  free: ['0.5 vCPU', '1 GB RAM', '5 GB storage', '1 instance', 'Free forever', 'Community support'],
  developer: ['1.5 vCPU', '4 GB RAM', '15 GB storage', '2 instances', 'First month free', 'Email support', 'Custom domain'],
  pro: ['2 vCPU', '6 GB RAM', '20 GB storage', '2 instances', 'First month free', 'Priority support', 'Custom domain', 'Webhook triggers'],
  custom: ['Choose your CPU', 'Choose your RAM', 'Choose your storage', 'Multiple instances', 'Dedicated support', 'SLA available'],
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export default function PricingSection({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  function handlePlanCTA() {
    if (isAuthenticated) {
      window.location.href = '/dashboard';
    } else {
      setLoginOpen(true);
    }
  }

  return (
    <>
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">
              Pricing
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text">
              Simple, transparent pricing
            </h2>
            <p className="text-text-secondary mt-4 max-w-xl mx-auto">
              Start free. Upgrade when your app grows. Cancel anytime.
            </p>
          </motion.div>

          {/* Cards */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
          >
            {ORBIT_PLANS.map((plan) => (
              <motion.div
                key={plan.id}
                variants={cardVariants}
                className={`relative flex flex-col rounded-2xl border p-6 transition-colors ${
                  plan.highlight
                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="font-heading font-bold text-text text-xl mb-1">{plan.name}</h3>
                  <p className="text-text-muted text-xs">{plan.tagline}</p>
                </div>

                <div className="mb-6">
                  <span className="text-3xl font-bold text-text font-heading">
                    {plan.price === 0
                      ? 'Free'
                      : plan.price === null
                        ? 'Custom'
                        : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-text-muted text-sm ml-1">/mo</span>
                  )}
                </div>

                <ul className="flex-1 space-y-2.5 mb-6">
                  {PLAN_FEATURES[plan.id].map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-text-secondary">
                      <CheckIcon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={handlePlanCTA}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-primary hover:bg-primary/90 text-white'
                      : 'bg-white/5 hover:bg-white/10 text-text border border-border'
                  }`}
                >
                  {plan.id === 'custom' ? 'Contact us' : 'Get started'}
                </button>
              </motion.div>
            ))}
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
