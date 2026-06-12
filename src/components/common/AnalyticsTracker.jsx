import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../../services/analytics';

export default function AnalyticsTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageView(`${pathname}${search}`);
  }, [pathname, search]);

  return null;
}
