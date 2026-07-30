// Where a user manages the account in a browser, derived from whichever API base
// the CLI is pointed at — so a dev pointing DIAL_API_URL at localhost gets the
// local dashboard, not production's.
//
// Deliberately import-free: api.ts installs a global undici dispatcher at import
// time, and this is pure string work that shouldn't drag that into its own test.
// Callers pass `baseUrl()` in.

/**
 * The dashboard URL for an API base. The web app lives on the same host as the API
 * minus its `api.` label (`api.getdial.ai` → `getdial.ai`); a base without that
 * label — staging, or a localhost dev server serving both — is used as-is.
 */
export function dashboardUrl(apiBase: string): string {
  const url = new URL(apiBase);
  // Strip only a leading `api.` LABEL. A substring check would turn a host like
  // `apiary.example.com` into `ary.example.com`.
  if (url.hostname.startsWith("api.")) url.hostname = url.hostname.slice("api.".length);
  // `pathname` is "/" for a bare origin and keeps a trailing slash when one was
  // given, so join on a trimmed copy rather than concatenating blindly.
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/dashboard`;
  return url.toString();
}

/**
 * The closing line of `dial onboard`: where to manage the account, and which
 * address signs in there.
 *
 * The address matters more than it looks. Sign-in is an emailed code, and when an
 * agent onboarded on the user's behalf the user usually doesn't know which address
 * it used — that's the single biggest reason they never reach the dashboard. Omitted
 * when the CLI genuinely doesn't know it (an explicit `--verification-id` with no
 * pending signup), since offering to sign in as nobody is worse than saying nothing.
 */
export function dashboardHint(url: string, email: string | null): string {
  return email
    ? `manage your account: ${url}   (sign in with ${email} — it emails you a code)`
    : `manage your account: ${url}   (sign in with the email this account was created under)`;
}
