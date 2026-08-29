// Extracts the client IP from request headers for audit logging.
//
// On Scalingo the app sits behind the platform router, which appends the real client IP
// as the LAST hop of x-forwarded-for. Earlier hops are client-supplied and spoofable, so
// we take the right-most entry. If you ever front this with another trusted proxy, adjust
// the hop you trust accordingly.

export const getClientIp = (headers: Headers): string | null => {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }
  return headers.get('x-real-ip');
};
