# IgniteAI Expo

Site, registration, and admin/judge portal for the IgniteAI Expo (formerly the IgniteCS Programming Expo).
Static HTML/CSS/JS — no build step.

- **Live:** https://igniteaiexpo.org (Vercel project `igniteai-expo`). `ignitecsexpo.org` redirects here via `vercel.json`.
- **Deploy:** `vercel deploy --prod` from this folder.
- **Backend:** Appwrite Cloud (`sfo`), database `expo`. IDs are in `js/register.js` and `portal/common.js`.

## Layout

| Path | What |
|---|---|
| `index.html`, `css/expo.css`, `js/expo.js` | Public site. Dates for the countdown are at the top of `js/expo.js`. |
| `register.html`, `js/register.js` | Application form. Submits to the `expo-api` function, which assigns the entry number. |
| `results.html`, `certificate.html`, `js/certificate.js` | Public results page and private-link certificates. |
| `portal/` | Sign-in, admin portal (`admin.html`) and judge portal (`judge.html`). |
| `functions/expo-api/` | Appwrite function: registration + entry numbers, email (SMTP), certificate lookup, people list. |
| `scripts/appwrite_setup.py` | Idempotent: creates teams, tables, permissions, first season, first admin. |
| `scripts/deploy-function.sh` | Creates/updates and deploys the function. |

Older template pages (`blog.html`, `shortcodes.html`, …) are unused leftovers.

## Roles and privacy

Appwrite Teams `admins` and `judges`. Judges can read `projects` only — never `registrations`
(family contact details). Each judge sees only their own rows in `reviews`. Only the function writes registrations.

Judges belong to contests (seasons): the Judges tab's invite link is `judge-signup.html?contest=<season>&code=<code>`,
and a judge sees the contests they were approved for (`judgeHome` in the function). Other judges' reviews of a
project come from the function's `projectReviews`, and only after the judge has submitted their own. The rubric
(three 1–10 scores, public + private comment) is `CRITERIA` in `portal/common.js`.

Google sign-in needs the Google provider switched on in Appwrite (Auth → Settings → Google) with a Google OAuth
client whose redirect URI is `https://sfo.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/<project id>`.

## A new season (each year)

1. Portal → **Seasons** → *Start a new season*; set the deadline, open registration, make it current.
   Entry numbers restart at 1000. Judges and organizers carry over.
2. Portal → **Settings**: certificate date/signer, interview date, Zoom links.
3. Update the dates and copy in `index.html`, `js/expo.js` and the thank-you text in `register.html`.
4. `vercel deploy --prod`.

## Secrets

Never commit API keys. The function's SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`) live in the function's environment variables in the Appwrite console. The setup scripts read
`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_KEY` from the environment.
