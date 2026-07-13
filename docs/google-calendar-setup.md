# Google Calendar Setup

One-time setup to enable Calendar sync on gig approval.

## 1. Create a Google Cloud project

1. Go to console.cloud.google.com → New Project → name it "Doug Dashboard"
2. Enable the **Google Calendar API**: APIs & Services → Library → search Calendar → Enable

## 2. Create OAuth credentials

1. APIs & Services → Credentials → Create Credentials → OAuth client ID
2. Application type: **Web application**
3. Add `http://localhost:3000` to Authorized redirect URIs (for the one-time auth step)
4. Download the JSON — you need `client_id` and `client_secret`

## 3. Get a refresh token (one-time)

Run this in your terminal, substituting your values:

```bash
# Step 1: open this URL in a browser and log in as yourself
echo "https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000&response_type=code&scope=https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent"

# Step 2: after you approve, Google redirects to localhost:3000?code=XXXX
# Copy the code from the URL, then exchange it:
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=PASTE_CODE_HERE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000" \
  -d "grant_type=authorization_code"

# The response contains "refresh_token" — copy it
```

## 4. Store as Worker secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put GOOGLE_CALENDAR_ID
# For GOOGLE_CALENDAR_ID: use "primary" for your main calendar,
# or find a specific calendar ID in Google Calendar → Settings → [calendar] → Calendar ID
```

## 5. Verify

After deploying, approve a gig with a deadline — the Calendar event should appear
within a few seconds. The 📅 icon appears on the Overview page next to synced gigs.

## Notes

- The refresh token never expires unless you revoke access or change your Google password.
- Calendar sync degrades gracefully: if the secrets aren't set, approval still works,
  it just skips the Calendar step.
- To test locally: add secrets to a `.dev.vars` file (gitignored):
  ```
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GOOGLE_REFRESH_TOKEN=...
  GOOGLE_CALENDAR_ID=primary
  ```
