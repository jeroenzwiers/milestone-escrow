// Site-wide password for the hosted demo (HTTP Basic auth), so bots can't reach the
// AI features. Off when SITE_PASSWORD is not set, e.g. in local development.
// Kept free of Node-only APIs because it runs in proxy.ts.

export const PUBLIC_PATHS = ["/api/webhooks/paypal"]; // PayPal must reach this; it verifies its own signatures

function sameString(a: string, b: string): boolean {
  // Constant-time comparison so the password can't be guessed character by character.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function isAuthorized(authorization: string | null, user: string, password: string): boolean {
  if (!authorization?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authorization.slice(6).trim());
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  // Evaluate both so the response time doesn't reveal which part was wrong.
  const userOk = sameString(decoded.slice(0, sep), user);
  const passOk = sameString(decoded.slice(sep + 1), password);
  return userOk && passOk;
}
