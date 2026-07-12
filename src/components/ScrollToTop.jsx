import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll to the top on every route change. The app uses <BrowserRouter>
 * (not a data router), so react-router's <ScrollRestoration> is unavailable;
 * this useLocation + useEffect pattern is the equivalent. Without it, each page
 * retains the previous route's scroll offset — most visibly on General Ledger,
 * whose flex `order-*` layout lands a retained low offset at the bottom.
 *
 * Fires only on `pathname` change, so intra-page anchored scrolls
 * (e.g. reactivate-target scrollIntoView) are unaffected.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
