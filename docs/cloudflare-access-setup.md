# Cloudflare Access — login & redirect troubleshooting

The dashboard is a self-hosted app protected by **Cloudflare Access**. There is
no auth code in the Worker itself (see `src/index.ts`) — Access sits in front of
`dashboard.dougmcarthur.net` at the edge and only forwards authenticated
requests to the Worker.

- **App URL:** `https://dashboard.dougmcarthur.net/`
- **Access team domain:** `solitary-fire-f486.cloudflareaccess.com`

## Symptom

You open `https://dashboard.dougmcarthur.net/`, get the Cloudflare login prompt,
log in successfully — and land on the **Cloudflare account dashboard**
(`dash.cloudflare.com`) instead of the app.

## What's already confirmed working (verified on the wire)

A raw request to the app shows the app-side configuration is **correct**:

```
GET https://dashboard.dougmcarthur.net/
→ 302 Found
  Location: https://solitary-fire-f486.cloudflareaccess.com/cdn-cgi/access/login/dashboard.dougmcarthur.net?...&redirect_url=%2F
```

The signed `meta` token in that redirect contains `"redirect_url":"/"`, so Access
*intends* to return you to the app root after authentication. **The app and the
Access application's redirect target are not the problem.**

That means the breakage is at the **identity-provider / login step** on the
`cloudflareaccess.com` page — after you authenticate, the login flow isn't
honoring `redirect_url`. Landing specifically on `dash.cloudflare.com` (the
account admin, *not* the app and *not* the Access App Launcher) is the classic
sign that the login is authenticating you into your **Cloudflare account**
rather than passing you through a proper Access identity provider — the account
login flow has no knowledge of Access's `redirect_url`, so on success it just
drops you at the account home.

## Root cause (confirmed)

The `Log in to dashboard` screen at `solitary-fire-f486.cloudflareaccess.com`
offers exactly **one** option under "Sign in with:" — a **Cloudflare** button.
That button is the **Cloudflare identity provider**: it authenticates you with
your existing **Cloudflare account credentials**.

This is now the *default and only* login method for the org because of a
platform change: as of **June 2026**, newly created Zero Trust organizations get
the Cloudflare identity provider added automatically and **One-time PIN is no
longer added by default** (previously new orgs started with OTP). So this org
was left with the Cloudflare-account login as its sole IdP, and that login is
what round-trips you to `dash.cloudflare.com`.

The fix is to add a login method that reliably returns to the app — **One-time
PIN** is the simplest (zero external configuration).

## The fix (in the Zero Trust dashboard)

Everything below is at **`dash.cloudflare.com`** → **Zero Trust**. (Managing Zero
Trust necessarily starts from the Cloudflare dashboard — that's expected; the
goal is for the *app login* flow to stop ending there.)

1. **Add One-time PIN as a login method.** *(the actual fix)*
   Zero Trust → **Integrations → Identity providers** → **Add new identity
   provider** → **One-time PIN** → **Save**. No configuration is required — OTP
   emails a login code to any email allowed by policy.
   - Menu note: it is **Integrations → Identity providers** in the current UI.
     Older guides say "Settings → Authentication → Login methods"; that path no
     longer exists.
   - If a third-party email scanner (Mimecast, Barracuda, etc.) is in play,
     allowlist `noreply@notify.cloudflare.com`.

2. **Enable OTP for the app.**
   Zero Trust → **Access → Applications → (the dashboard app) → Authentication**
   (Edit).
   - Either turn on **"Accept all available identity providers"**, or explicitly
     check **One-time PIN**.
   - You can leave the **Cloudflare** IdP enabled as a secondary option; OTP is
     what gives the dependable return-to-app path. If **Instant Auth** is on it
     skips the chooser and jumps to a single IdP — turn it off while debugging so
     the login screen shows the new OTP option.

3. **Confirm an Allow policy matches you.**
   Same app → **Policies**.
   - There must be an **Allow** policy whose include rule matches your identity —
     e.g. Emails → `dougmcarthur0@gmail.com` (or your login email).
   - Access is deny-by-default; with no matching Allow policy you can authenticate
     and still be turned away.

4. **Verify the app's domain binding (only if login still misbehaves).**
   Workers & Pages → **dougmcarthur-dashboard → Settings → Domains & Routes**.
   - `dashboard.dougmcarthur.net` should be listed as a **Custom Domain**, and DNS
     should have a **proxied** record for `dashboard`. (Confirmed reachable — the
     302 above comes from the Worker's zone — but worth checking if issues persist.)

## How to test a fix

Use a **private/incognito window** (no stale `CF_Authorization` cookie) and go
directly to `https://dashboard.dougmcarthur.net/`. A correct flow is:

```
dashboard.dougmcarthur.net
  → solitary-fire-f486.cloudflareaccess.com  (choose "One-time PIN", enter code)
  → back to dashboard.dougmcarthur.net/       (the app loads)
```

If you still land on `dash.cloudflare.com`, you almost certainly clicked the
**Cloudflare** button again instead of the new **One-time PIN** option — that
button is the account-credentials login and is the source of the misredirect.

## Switching to Google Workspace SSO (preferred long-term login)

The intended primary login is **Google Workspace** as `doug@dougmcarthur.net`
(the Workspace identity used for all music-related things). This is more secure
than OTP — it enforces Workspace MFA and follows account lifecycle — but the
switch has one real trap: **the Access policy matches your Workspace email, not
the consumer gmail**, so do it additively and verify before removing anything.

### Do it in this order (never lock yourself out)

1. **Add the Google Workspace IdP.**
   Zero Trust → **Integrations → Identity providers → Add new identity provider
   → Google Workspace**. It needs:
   - **Client ID + Client Secret** from a Google Cloud OAuth 2.0 client (add
     Cloudflare's callback URL as the authorized redirect URI).
   - A Workspace **admin email** and the **Admin SDK API** enabled in that GCP
     project (used to read directory/groups).
   - **Domain-wide delegation** is only required if you want *group-based*
     policies; a plain email/domain policy does not need it.

2. **Enable it on the app** — Access → Applications → dashboard →
   **Authentication**. Leave **One-time PIN** (and the Cloudflare button) enabled
   for now as a fallback.

3. **Add `doug@dougmcarthur.net` to the Allow policy** — same app → **Policies**.
   *Add* it; do not remove `dougmcarthur0@gmail.com` yet.
   - Note: **Emails ending in `@dougmcarthur.net`** would let *every* Workspace
     user in — pin to the specific email (or a group) unless that's intended.

4. **Verify** in the `doug@dougmcarthur.net` Chrome profile (or incognito): go to
   `https://dashboard.dougmcarthur.net/`, sign in with Google, confirm you land
   on the app.

5. **Only after step 4 succeeds**, tighten:
   - Remove `dougmcarthur0@gmail.com` from the policy.
   - Optionally disable **One-time PIN** and the **Cloudflare** IdP on the app so
     Google Workspace is the only door. (Keep OTP if you ever need guest access —
     Workspace login only works for users in your domain.)

### Why the gmail address must go last, not first

Google **Workspace** login presents `doug@dougmcarthur.net`. If you remove the
gmail from the policy (or flip OTP off) *before* the Google IdP is proven, a
misconfiguration leaves no identity that matches the policy — you authenticate
and get denied, with no way back in.
