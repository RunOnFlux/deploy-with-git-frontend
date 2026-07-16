import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Cpu, MemoryStick, HardDrive, Server, Gift, Rocket, Info, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ORBIT_PLANS } from '../../config/plans';
import BokehBackground, { BOKEH_PRICING } from './BokehBackground';

const PLAN_COLORS = {
  free:     { bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   text: 'text-slate-400',   glow: 'hover:shadow-slate-500/20',  btnGrad: 'from-slate-500 to-slate-400',   btnShadow: 'hover:shadow-slate-500/40'  },
  standard: { bg: 'bg-primary/10',     border: 'border-primary/20',     text: 'text-primary',     glow: 'hover:shadow-primary/25',    btnGrad: 'from-indigo-500 to-blue-500',  btnShadow: 'hover:shadow-primary/50'    },
  pro:      { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  text: 'text-purple-400',  glow: 'hover:shadow-purple-500/20', btnGrad: 'from-purple-500 to-violet-500',btnShadow: 'hover:shadow-purple-500/40' },
  custom:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   glow: 'hover:shadow-amber-500/20',  btnGrad: 'from-amber-500 to-orange-400', btnShadow: 'hover:shadow-amber-500/40'  },
};

const PLAN_RESOURCES = {
  free:     [{ icon: Cpu, label: 'CPU',       value: '0.5 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '1 GB' },
             { icon: HardDrive, label: 'Storage', value: '5 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '1' }],
  standard: [{ icon: Cpu, label: 'CPU',       value: '1.5 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '4 GB' },
             { icon: HardDrive, label: 'Storage', value: '15 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '2' }],
  pro:      [{ icon: Cpu, label: 'CPU',       value: '2.0 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '6 GB' },
             { icon: HardDrive, label: 'Storage', value: '20 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '2' }],
  custom:   [{ icon: Cpu, label: 'CPU',       value: '0.1 – 15 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '100 MB – 59 GB' },
             { icon: HardDrive, label: 'Storage', value: '1 – 820 GB' },
             { icon: Server, label: 'Instances', value: '1 – 3' }],
};

const PERIODS = [
  { id: 'monthly', label: 'Monthly',  months: 1,  discount: 0    },
  { id: 'annual',  label: 'Annual',   months: 12, discount: 0.12 },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export default function PricingSection({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('annual');

  const activePeriod = PERIODS.find((p) => p.id === period);
  const isAnnual = activePeriod.months === 12;

  function getDisplayPrice(plan) {
    if (plan.price === 0 || plan.price === null) return null;
    return (plan.price * (1 - activePeriod.discount)).toFixed(2);
  }

  function handlePlanCTA(planId) {
    if (isAuthenticated) {
      navigate(`/dashboard/deploy?plan=${planId}`);
    } else {
      navigate(`/login?plan=${planId}`);
    }
  }

  return (
    <>
      <section className="relative py-20 lg:py-28 px-6 overflow-hidden">
        <BokehBackground orbs={BOKEH_PRICING} />
        <div id="pricing" className="max-w-6xl mx-auto">
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <p className="inline-flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-primary/20 bg-primary/8">
              Pricing
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-text">
              Select Your <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">Plan</span>
            </h2>
            <p className="text-text-secondary mt-4 max-w-xl mx-auto">
              Choose your plan based on your resource needs.
            </p>
            <p className="text-text-secondary/80 text-sm leading-relaxed max-w-2xl mx-auto mt-4">
              Start free and scale as you grow. Every plan — including the free-forever tier —
              includes unlimited builds, automatic deploys on every push, rollbacks, and the full
              Orbit feature set; paid plans add dedicated CPU, RAM and storage, and the first month
              is free. There is no contract and no egress billing: you pay for the resources your
              app reserves, and you can change or cancel a plan at any time.
            </p>
          </motion.div>

          {/* Billing period toggle */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex justify-center mb-12"
          >
            <div className="inline-flex items-center p-1 rounded-xl bg-surface border border-border gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    period === p.id
                      ? 'bg-primary text-white shadow'
                      : 'text-text-secondary hover:text-text'
                  }`}
                >
                  {p.label}
                  {p.discount > 0 && (
                    <span
                      className={`ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        period === p.id
                          ? 'bg-white/20 text-white'
                          : 'bg-accent/15 text-accent'
                      }`}
                    >
                      Save {Math.round(p.discount * 100)}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Cards */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch"
          >
            {ORBIT_PLANS.map((plan) => {
              const displayPrice = getDisplayPrice(plan);
              const isRecommended = plan.highlight;
              const resources = PLAN_RESOURCES[plan.id] ?? [];
              const c = PLAN_COLORS[plan.id];

              return (
                <div key={plan.id} className="relative flex flex-col pt-3.5">
                  {/* Most Popular badge floats above the card border */}
                  {isRecommended && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
                      <span className="bg-primary text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
                        Most Popular
                      </span>
                    </div>
                  )}

                <motion.div
                  variants={cardVariants}
                  className={`relative flex flex-col gap-4 rounded-2xl border-2 p-6 transition-all duration-300 overflow-hidden flex-1
                    shadow-lg ${c.glow}
                    ${isRecommended
                      ? 'border-primary/40 bg-surface shadow-primary/10'
                      : 'border-border bg-surface hover:border-opacity-60'
                    }`}
                >

                  {/* Annual savings corner ribbon — all paid plans */}
                  {isAnnual && plan.id !== 'free' && (
                    <div
                      className="absolute top-5 -right-9 w-36 text-white text-xs font-bold text-center py-1.5 rotate-45 shadow-md pointer-events-none"
                      style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)' }}
                    >
                      Save 12%
                    </div>
                  )}

                  {/* Price badge */}
                  <div className={`flex flex-col items-center justify-center gap-0.5 px-4 py-3 h-20 ${c.bg} border ${c.border} rounded-xl`}>
                    {plan.price === null && (
                      <span className={`text-xs font-semibold uppercase tracking-wide ${c.text} opacity-85`}>Starting at</span>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-bold font-heading ${c.text}`}>
                        {plan.price === 0 ? '$0' : plan.price === null ? '$0.99' : `$${displayPrice}`}
                      </span>
                      {plan.price === 0 && <span className={`text-sm font-semibold ${c.text} opacity-70`}>*</span>}
                      {plan.price !== 0 && (
                        <>
                          {isAnnual && plan.price !== null && (
                            <span className="text-text-muted text-xs line-through">${plan.price}</span>
                          )}
                          <span className="text-text-muted text-sm">/mo</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* First month free / Free forever pill */}
                  <div className="flex items-center justify-center gap-1.5 px-3 py-1 border border-border rounded-full text-xs font-semibold text-text-secondary uppercase tracking-wide w-fit mx-auto">
                    <Gift className="w-3 h-3 shrink-0" />
                    {plan.price === 0 ? 'Free forever*' : 'First month free*'}
                  </div>

                  {/* Plan header */}
                  <div className="text-center pb-4 border-b border-border flex flex-col justify-center min-h-[5rem]">
                    <h3 className="font-heading text-xl font-semibold text-text mb-1">{plan.name}</h3>
                    <p className="text-sm text-text-secondary">{plan.description}</p>
                  </div>

                  {/* Annual billing note */}
                  {isAnnual && plan.price > 0 && (
                    <p className="text-xs text-text-secondary text-center -mt-2">
                      Billed ${(displayPrice * 12).toFixed(2)}/yr
                    </p>
                  )}

                  {/* Resource rows */}
                  <div className="flex flex-col gap-2.5 flex-1">
                    {resources.map(({ icon: Icon, label, value }) => (
                      <div
                        key={label}
                        className="grid items-center gap-2.5 px-3 py-2 bg-surface-hover rounded-xl"
                        style={{ gridTemplateColumns: '20px 1fr auto' }}
                      >
                        <Icon className="w-4 h-4 text-text-muted" />
                        <span className="text-xs text-text-secondary font-medium">{label}</span>
                        <span className="text-xs font-semibold text-text text-right">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handlePlanCTA(plan.id)}
                    className={`group relative w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5
                      overflow-hidden text-white transition-all duration-300
                      bg-gradient-to-r ${c.btnGrad}
                      shadow-md ${c.btnShadow} hover:shadow-lg hover:brightness-110`}
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full
                      bg-gradient-to-r from-transparent via-white/20 to-transparent
                      transition-transform duration-500 ease-in-out" />
                    {plan.price === 0 ? (
                      <><Rocket className="w-4 h-4" /> Start Deploying</>
                    ) : (
                      <><Gift className="w-4 h-4" /> Start Free Trial</>
                    )}
                  </button>
                </motion.div>
                </div>
              );
            })}
          </motion.div>

          {/* Disclaimer */}
          <div className="mt-10 p-5 bg-surface border border-border rounded-xl space-y-2.5">
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="text-text font-semibold">*</span> Restrictions may apply to prevent abuse.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="text-text font-semibold">*</span> The Free plan is automatically
              renewed as long as you have only one Git app running on the network. Additional Git apps are
              charged $0.99/month each.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="text-text font-semibold">*</span> The first month is free for customers new
              to Flux Cloud — one free month per account, not per app or repository. If you've deployed any
              app on Flux before, standard pricing applies. Our 30-day money-back guarantee covers your first
              paid month only and does not apply when the first month was free.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed flex items-start gap-1.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-text-muted" />
              The Free plan runs on a single instance. Brief downtime may occur if the hosting node restarts.
              For high-availability apps, Standard or Pro plans are recommended.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed flex items-start gap-1.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-text-muted" />
              Private GitHub repositories are deployed as Enterprise apps, running exclusively on ArcaneOS
              nodes with full encryption. Enterprise adds $1.33/month on Free, or $2.66/month on Standard,
              Pro, and Custom plans, already included in the price shown at checkout.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
