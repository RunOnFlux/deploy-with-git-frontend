import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Send, CheckCircle, AlertCircle, TicketCheck,
  Mail, Tag, FileText, MessageSquare, ChevronDown,
  BookOpen, MessageCircle, Github, ExternalLink, HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/dashboard';

const ISSUE_TYPES = [
  'General question',
  'Deployment issue',
  'Billing & payments',
  'App not starting',
  'Performance issue',
  'Account issue',
  'Other',
];

const ENDPOINT = 'https://relay.ssp.runonflux.io/v1/ticket';

const LINKS = [
  {
    icon: BookOpen,
    label: 'Documentation',
    desc: 'Guides and API reference',
    href: 'https://docs.runonflux.io',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    icon: MessageCircle,
    label: 'Discord Community',
    desc: 'Chat with the Flux community',
    href: 'https://discord.gg/runonflux',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
  },
  {
    icon: Github,
    label: 'GitHub',
    desc: 'Source code and issues',
    href: 'https://github.com/RunOnFlux',
    color: 'text-text-secondary',
    bg: 'bg-surface-hover',
    border: 'border-border/30',
  },
];

export default function Support() {
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [form, setForm] = useState({ email: '', type: ISSUE_TYPES[0], subject: '', description: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const dropdownRef = useRef(null);
  const abortRef = useRef(null);
  const timerRef = useRef([]);

  useEffect(() => {
    if (user?.email) setForm((f) => ({ ...f, email: f.email || user.email }));
  }, [user]);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    timerRef.current.forEach(clearTimeout);
    abortRef.current?.abort();
  }, []);

  const validate = () => {
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    if (!form.subject.trim()) errs.subject = 'Subject is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setErrorMsg('');
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-challenge': 'fluxos-support-form' },
        body: JSON.stringify(form),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Failed to submit ticket. Please try again.');
      }

      const data = await res.json();
      if (data.status === 'error') throw new Error(data.data?.message || 'Submission failed.');

      setSubmitted(true);
      setForm({ email: user?.email || '', type: ISSUE_TYPES[0], subject: '', description: '' });
      timerRef.current.push(setTimeout(() => setSubmitted(false), 8000));
    } catch (err) {
      if (err.name === 'AbortError') return;
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      timerRef.current.push(setTimeout(() => setErrorMsg(''), 8000));
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase = 'w-full pl-10 pr-4 py-2.5 bg-background border text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 ';
  const inputClass = (f) =>
    `${inputBase} ${errors[f] ? 'border-red-500/60' : 'border-border/40 hover:border-border/60'}`;

  return (
    <>
      <Helmet>
        <title>Support — Orbit</title>
      </Helmet>

      <div className="p-6">
        <PageHeader
          icon={HelpCircle}
          title="Support"
          subtitle="Get help with your Orbit deployments."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Ticket form */}
          <div className="lg:col-span-2">
            <div className="card p-6">
              {/* Section heading */}
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                  <TicketCheck className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-text text-sm">Submit a ticket</h2>
                  <p className="text-xs text-text-muted">We&apos;ll respond via email</p>
                </div>
              </div>

              {/* Success */}
              {submitted && (
                <div className="flex items-start gap-3 p-4 mb-5 bg-green-500/10 border border-green-500/30 text-green-300">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Ticket submitted!</p>
                    <p className="text-xs text-green-300/80 mt-0.5">We&apos;ll review your request and respond via email.</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {errorMsg && (
                <div className="flex items-start gap-3 p-4 mb-5 bg-red-500/10 border border-red-500/30 text-red-300">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{errorMsg}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5 ml-1">Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      maxLength={254}
                      placeholder="your@email.com"
                      readOnly={!!user?.email}
                      className={`${inputClass('email')} ${user?.email ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                </div>

                {/* Issue type */}
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-sm font-medium text-text mb-1.5 ml-1">Issue type</label>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="relative w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-background border border-border/40 hover:border-border/60 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <span>{form.type}</span>
                    <ChevronDown className={`w-4 h-4 text-text-muted ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-surface border border-border/40 shadow-xl shadow-black/30 overflow-hidden">
                      {ISSUE_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setForm((f) => ({ ...f, type: t })); setDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm cursor-pointer ${
                            form.type === t
                              ? 'bg-primary/15 text-primary font-medium'
                              : 'text-text-secondary hover:bg-surface-hover/50 hover:text-text'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5 ml-1">Subject *</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      name="subject"
                      value={form.subject}
                      onChange={handleChange}
                      maxLength={200}
                      placeholder="Brief summary of your issue"
                      className={inputClass('subject')}
                    />
                  </div>
                  {errors.subject && <p className="text-xs text-red-400 mt-1">{errors.subject}</p>}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-text mb-1.5 ml-1">Description *</label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-text-muted pointer-events-none" />
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      maxLength={5000}
                      rows={6}
                      placeholder="Please describe your issue in detail…"
                      className={`${inputClass('description')} resize-none`}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    {errors.description
                      ? <p className="text-xs text-red-400">{errors.description}</p>
                      : <span />
                    }
                    <span className="text-xs text-text-muted">{form.description.length}/5000</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || submitted}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Ticket
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Sidebar links */}
          <div className="flex flex-col gap-4">
            <h2 className="font-semibold text-text text-sm">Helpful resources</h2>
            {LINKS.map(({ icon: Icon, label, desc, href, color, bg, border }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={`card p-4 flex items-center gap-3 hover:border-primary/30 group`}
              >
                <div className={`w-9 h-9 ${bg} border ${border} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text group-hover:text-primary ">{label}</p>
                  <p className="text-xs text-text-muted">{desc}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              </a>
            ))}

            <div className="card p-4 mt-2 bg-primary/5 border-primary/20">
              <p className="text-sm font-medium text-primary mb-1">Response time</p>
              <p className="text-xs text-text-muted">
                Tickets are typically answered within 24–48 hours on business days.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
