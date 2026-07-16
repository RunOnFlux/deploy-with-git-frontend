import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import { Check, Copy, ExternalLink, FolderTree, GitBranch, Github, Rocket } from 'lucide-react';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import deployToFluxImage from '../assets/deploytoflux.png';
import { DEFAULT_APP_URL } from '../../config/defaults';

const BUTTON_IMAGE_URL = `${DEFAULT_APP_URL}/deploytoflux.png`;
const SAMPLE_REPO = 'https://github.com/RunOnFlux/deploy-with-git-samples';

function buildDeployUrl({ repo, branch, projectPath, plan }) {
  const encodeValue = (value) => encodeURIComponent(String(value).trim())
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/');
  const params = [
    ['repo', repo],
    ['branch', branch],
    ['projectPath', projectPath],
    ['plan', plan],
  ]
    .filter(([, value]) => String(value ?? '').trim())
    .map(([key, value]) => `${key}=${encodeValue(value)}`)
    .join('&');

  return `${DEFAULT_APP_URL}/?${params}`;
}

function CopyButton({ value, id, copied, onCopy }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value, id)}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:border-primary/40 hover:text-text transition-colors"
    >
      {copied === id ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
      {copied === id ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function DeployToFluxPage() {
  const [repo, setRepo] = useState(SAMPLE_REPO);
  const [branch, setBranch] = useState('master');
  const [projectPath, setProjectPath] = useState('express');
  const [plan, setPlan] = useState('free');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const previousTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      if (previousTheme) document.documentElement.setAttribute('data-theme', previousTheme);
    };
  }, []);

  const deployUrl = useMemo(
    () => buildDeployUrl({ repo, branch, projectPath, plan }),
    [repo, branch, projectPath, plan],
  );
  const markdown = `[![Deploy to Flux](${BUTTON_IMAGE_URL})](${deployUrl})`;
  const html = `<a href="${deployUrl.replace(/&/g, '&amp;')}"><img src="${BUTTON_IMAGE_URL}" alt="Deploy to Flux" /></a>`;
  const canonical = `${DEFAULT_APP_URL}/deploy-to-flux`;

  async function copy(value, id) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(''), 1600);
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Add a Deploy to Flux button to your repository',
    description: 'Create a one-click Orbit deployment link for a GitHub, GitLab, or Bitbucket repository.',
    step: [
      { '@type': 'HowToStep', name: 'Configure the link', text: 'Enter the repository URL and optional branch, project path, and plan.' },
      { '@type': 'HowToStep', name: 'Copy the snippet', text: 'Copy the generated Markdown or HTML.' },
      { '@type': 'HowToStep', name: 'Add it to the repository', text: 'Paste the snippet into the repository README and commit it.' },
    ],
  };

  return (
    <>
      <Helmet>
        <title>Deploy to Flux Button | Orbit</title>
        <meta name="description" content="Add a Deploy to Flux button to your repository and let anyone deploy it through Orbit with one click." />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content="Deploy to Flux Button | Orbit" />
        <meta property="og:description" content="Generate a one-click Deploy to Flux button for your repository README." />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <MotionConfig reducedMotion="user">
        <div className="bg-background text-text min-h-screen">
          <Navbar />

          <main className="max-w-4xl mx-auto px-6 pt-28 pb-24">
            <nav aria-label="Breadcrumb" className="text-sm text-text-muted mb-6">
              <a href="/" className="hover:text-text transition-colors">Home</a>
              <span className="mx-2">/</span>
              <span className="text-text-secondary">Deploy to Flux button</span>
            </nav>

            <div className="max-w-3xl mb-12">
              <p className="inline-flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-4">
                <Rocket className="w-4 h-4" /> One-click deployment
              </p>
              <h1 className="font-heading text-4xl sm:text-5xl font-bold text-text leading-tight mb-5">
                Add a Deploy to Flux button
              </h1>
              <p className="text-lg text-text-secondary leading-relaxed">
                Let users deploy your GitHub, GitLab, or Bitbucket repository through Orbit directly
                from its README. The link opens the deployment wizard with your chosen settings already filled in.
              </p>
            </div>

            <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-surface to-cyan-400/5 p-8 sm:p-10 mb-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <h2 className="font-heading text-2xl font-bold text-text mb-2">Button preview</h2>
                  <p className="text-sm text-text-secondary">Click it to test the generated deployment link.</p>
                </div>
                <a href={deployUrl} className="inline-flex" aria-label="Deploy the configured repository to Flux">
                  <img src={deployToFluxImage} alt="Deploy to Flux" width="136" height="28" className="block" />
                </a>
              </div>
            </section>

            <section className="mb-12" id="generator">
              <h2 className="font-heading text-3xl font-bold text-text mb-3">Button generator</h2>
              <p className="text-text-secondary mb-6">
                A repository URL is required. Branch, project path, and plan are optional and use the
                repository default or Orbit default when omitted.
              </p>

              <div className="rounded-2xl border border-border bg-surface/40 p-5 sm:p-6 space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-text mb-1.5">
                    <Github className="w-4 h-4 text-text-muted" /> Repository URL
                  </label>
                  <input className="input-base w-full font-mono text-sm" value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="https://github.com/owner/repository" />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-text mb-1.5">
                      <GitBranch className="w-4 h-4 text-text-muted" /> Branch
                    </label>
                    <input className="input-base w-full font-mono text-sm" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-text mb-1.5">
                      <FolderTree className="w-4 h-4 text-text-muted" /> Project path
                    </label>
                    <input className="input-base w-full font-mono text-sm" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="apps/web" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text mb-1.5">Plan</label>
                    <select className="input-base w-full text-sm" value={plan} onChange={(event) => setPlan(event.target.value)}>
                      <option value="">Orbit default</option>
                      <option value="free">Free</option>
                      <option value="standard">Standard</option>
                      <option value="pro">Pro</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-1.5">Generated deployment URL</label>
                  <div className="flex items-start gap-2 rounded-xl border border-border bg-background/70 p-3">
                    <code className="flex-1 text-xs text-text-secondary break-all leading-relaxed">{deployUrl}</code>
                    <CopyButton value={deployUrl} id="url" copied={copied} onCopy={copy} />
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-12">
              <h2 className="font-heading text-3xl font-bold text-text mb-3">Add it to your README</h2>
              <p className="text-text-secondary mb-6">
                Copy either snippet, paste it into your README, and commit the change. Explicitly including
                the repository URL makes the button reliable wherever the README is displayed.
              </p>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-text">Markdown</h3>
                    <CopyButton value={markdown} id="markdown" copied={copied} onCopy={copy} />
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-border bg-[#0a0f1c] p-4 text-xs text-text-secondary"><code>{markdown}</code></pre>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-text">HTML</h3>
                    <CopyButton value={html} id="html" copied={copied} onCopy={copy} />
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-border bg-[#0a0f1c] p-4 text-xs text-text-secondary"><code>{html}</code></pre>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border p-6">
              <h2 className="font-heading text-2xl font-bold text-text mb-4">Supported parameters</h2>
              <dl className="grid sm:grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                <dt><code className="text-primary">repo</code></dt><dd className="text-text-secondary">Full HTTPS repository URL.</dd>
                <dt><code className="text-primary">branch</code></dt><dd className="text-text-secondary">Branch to deploy.</dd>
                <dt><code className="text-primary">projectPath</code></dt><dd className="text-text-secondary">App directory for a monorepo.</dd>
                <dt><code className="text-primary">plan</code></dt><dd className="text-text-secondary">One of free, standard, pro, or custom.</dd>
              </dl>
              <a href={deployUrl} className="inline-flex items-center gap-2 mt-6 text-primary font-semibold hover:underline">
                Test this deployment link <ExternalLink className="w-4 h-4" />
              </a>
            </section>
          </main>

          <Footer />
        </div>
      </MotionConfig>
    </>
  );
}
