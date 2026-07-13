# Gmail Setup (for Reconcile with Gmail)

Uses the same Google Cloud project and OAuth client as Calendar.
You only need to add one new Worker secret: `GMAIL_REFRESH_TOKEN`.

## Get a Gmail refresh token

The Gmail token needs `gmail.readonly` scope (read-only — the app never sends or
deletes anything). If you haven't set up the Google OAuth client yet, do Calendar
first (`docs/google-calendar-setup.md`) — same project, same client.

```bash
# Step 1: open this URL in a browser and approve gmail.readonly
echo "https://accounts.google.com/o/oauth2/auth?\
client_id=YOUR_CLIENT_ID\
&redirect_uri=http://localhost:3000\
&response_type=code\
&scope=https://www.googleapis.com/auth/gmail.readonly\
&access_type=offline\
&prompt=consent"

# Step 2: exchange the code from the redirect URL
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=PASTE_CODE_HERE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000" \
  -d "grant_type=authorization_code"

# Copy the refresh_token from the response
```

## Store the secret

```bash
wrangler secret put GMAIL_REFRESH_TOKEN
# paste the refresh token when prompted
```

GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are already set (shared with Calendar).

## Test it

Deploy the Worker, go to the Sync page, click "Reconcile with Gmail".
The Settings page will also show Gmail status once the secret is set.
