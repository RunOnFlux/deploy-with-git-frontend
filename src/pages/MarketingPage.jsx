import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';
import { MARKETING_PAGES } from '../content/pagesContent';
import { DEFAULT_APP_URL } from '../../config/defaults';

/**
 * Renders a standalone marketing page (the decentralized-hosting pillar and the
 * /vs/* comparisons) from the shared content model in src/content/pagesContent.js.
 * The SAME data drives the static prerendered HTML (scripts/buildSeoContent.mjs),
 * so the crawlable shell and the hydrated app stay in sync. One component serves
 * every marketing route. Pass the route path via the `route` prop from App.jsx.
 */

function Block({ block }) {
  if (block.type === 'p') {
    return (
      <p
        className="text-text-secondary leading-relaxed mb-4"
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    );
  }
  if (block.type === 'h3') {
    return <h3 className="font-heading text-xl font-semibold text-text mt-6 mb-2">{block.text}</h3>;
  }
  if (block.type === 'ul') {
    return (
      <ul className="list-disc pl-5 space-y-2 mb-4 text-text-secondary">
        {block.items.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>
    );
  }
  if (block.type === 'table') {
    return (
      <div className="overflow-x-auto rounded-2xl border border-border my-6">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-border bg-surface">
              {block.headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-text-secondary font-medium ${i === 0 ? 'text-left' : 'text-left'} ${
                    i === 1 ? 'text-primary' : ''
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/50 last:border-0">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-4 py-3 align-top ${
                      ci === 0
                        ? 'text-text font-medium'
                        : ci === 1
                          ? 'text-text'
                          : 'text-text-muted'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function MarketingPage({ route }) {
  const page = MARKETING_PAGES[route];

  // Standalone marketing pages follow the landing page: always dark.
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev);
    };
  }, []);

  if (!page) return null;

  const canonical = `${DEFAULT_APP_URL}${route}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${DEFAULT_APP_URL}/` },
          { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: canonical },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: page.title,
        description: page.description,
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        mainEntity: page.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{page.title}</title>
        <meta name="description" content={page.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.description} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:title" content={page.title} />
        <meta name="twitter:description" content={page.description} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <MotionConfig reducedMotion="user">
        <div className="bg-background text-text min-h-screen">
          <Navbar />

          <article className="max-w-3xl mx-auto px-6 pt-28 pb-20">
            <nav aria-label="Breadcrumb" className="text-sm text-text-muted mb-6">
              <a href="/" className="hover:text-text transition-colors">Home</a>
              <span className="mx-2">/</span>
              <span className="text-text-secondary">{page.breadcrumb}</span>
            </nav>

            <h1 className="font-heading text-4xl sm:text-5xl font-bold text-text leading-tight mb-6">
              {page.h1}
            </h1>
            <p className="text-lg text-text-secondary leading-relaxed mb-10">{page.intro}</p>

            {page.sections.map((section, si) => (
              <section key={si} className="mb-8">
                <h2 className="font-heading text-2xl sm:text-3xl font-bold text-text mb-3">
                  {section.heading}
                </h2>
                {section.blocks.map((block, bi) => (
                  <Block key={bi} block={block} />
                ))}
              </section>
            ))}

            <section className="mt-12" id="faq">
              <h2 className="font-heading text-2xl sm:text-3xl font-bold text-text mb-4">
                Frequently asked questions
              </h2>
              <dl className="space-y-4">
                {page.faqs.map((f) => (
                  <div key={f.q} className="border border-border rounded-xl p-5">
                    <dt className="font-medium text-text mb-2">{f.q}</dt>
                    <dd className="text-sm text-text-secondary leading-relaxed">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="mt-12">
              <a
                href="/"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Orbit
              </a>
            </div>
          </article>

          <Footer />
        </div>
      </MotionConfig>
    </>
  );
}
