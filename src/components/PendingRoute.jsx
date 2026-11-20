import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Opens a route that was asked for from outside the Router (a tapped journal
 * reminder), then clears the request. Rendered last inside the Router so it
 * navigates after any redirect made in the same render. Signed out, the
 * request is dropped.
 */
export default function PendingRoute({ route, signedIn, onTaken }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!route) return;
    if (signedIn) navigate(route);
    onTaken(null);
  }, [route, signedIn, navigate, onTaken]);

  return null;
}
