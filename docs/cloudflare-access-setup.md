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

## Fix checklist (in the Zero Trust dashboard)

All of this lives at **`one.dash.cloudflare.com`** → **Zero Trust**. (Managing
Zero Trust necessarily starts from the Cloudflare dashboard — that's expected;
the goal is for the *app login* flow to stop ending there.)

1. **Check the identity providers.**
   Zero Trust → **Settings → Authentication → Login methods**.
   - Prefer a real IdP: **One-time PIN** (email code) is the simplest and needs
     no external setup, or a social IdP (Google/GitHub).
   - For each configured IdP, use the **Test** button and confirm it returns
     "Your connection works."
   - If the only "login method" in play is effectively your Cloudflare account,
     add One-time PIN and use that instead.

2. **Confirm the app's login options.**
   Zero Trust → **Access → Applications → (the dashboard app) → Authentication**.
   - Make sure the IdP(s) you fixed in step 1 are **enabled for this app**.
   - If **Instant Auth** is on with a single IdP, it skips the Access chooser and
     jumps straight to that IdP — fine once the IdP itself is healthy, but turn
     it off temporarily while debugging so you can see the Access login screen.

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
  → solitary-fire-f486.cloudflareaccess.com  (pick IdP / enter PIN)
  → back to dashboard.dougmcarthur.net/       (the app loads)
```

If you still land on `dash.cloudflare.com`, note **which IdP button you clicked**
before it went wrong — that identifies the misconfigured login method.
