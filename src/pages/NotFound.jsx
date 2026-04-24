import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <>
      <Helmet>
        <title>404 — Orbit</title>
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-8xl font-heading font-bold text-primary/20 mb-4">404</p>
          <h1 className="text-2xl font-semibold text-text mb-2">Page not found</h1>
          <p className="text-text-secondary text-sm mb-8">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link to="/" className="btn-primary">
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
