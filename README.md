# BloodLink

The BloodLink interface. TeSA Cohort 6 capstone, Team 4.

## What it is

BloodLink lets hospitals find and reserve blood units held by blood banks. Bank staff record the units they have. Hospital staff search for available units by blood type and request the ones they need. The bank then approves a request, which places a hold on the units, or declines it with a reason. This repo is the web interface (React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Formik and Yup). It talks to a separate Java/Spring service.

## Live demo

- Site: https://bloodlink-orpin.vercel.app
- Service: https://bloodlink-o2ie.onrender.com (source: [Fisayomii/Bloodlink](https://github.com/Fisayomii/Bloodlink))

There is no sign-up, because the API contract only offers `POST /sessions`. Sign in with one of these seeded demo accounts:

| Role           | Email                           | Password          |
| -------------- | ------------------------------- | ----------------- |
| Bank staff     | `staff@lagos-central.bank.demo` | `Demo-Password-1` |
| Hospital staff | `staff@yaba.hospital.demo`      | `Demo-Password-1` |

> **The first request can take about a minute.** The service runs on Render's free plan and sleeps when idle. Open https://bloodlink-o2ie.onrender.com/actuator/health first, wait for it to respond, then sign in.

## Try the story

1. Sign in as **bank staff** and record a new blood unit.
2. Sign out, then sign in as **hospital staff**. Search availability and find the unit.
3. Request it.
4. Sign back in as **bank staff** and open the request. Either:
   - **approve** it, which places a hold on the unit, or
   - **decline** it with a reason.
5. Sign in as **hospital staff** again to see the outcome.

## What's simulated

- Every bank, hospital, person and blood unit is fictional seed data. There is no patient data.
- **Mock mode** (`VITE_MOCK=true`) is for local development only. It adds:
  - a role picker on the sign-in page
  - a "simulate pending" switch
  - a box for forcing error responses

  None of these appear on the live site.

## Run locally

Requires Node.js 22 (the version CI uses).

```sh
npm install
cp .env.example .env.local
```

`.env.local` should contain:

```sh
VITE_API_URL=http://127.0.0.1:4010
VITE_MOCK=true
```

Then run each of these in its own terminal:

```sh
npm run mock   # Prism mock of contract/openapi.yaml on port 4010
npm run dev    # Vite dev server
```

To use a locally running service instead of the mock, use the commented lines in `.env.example`.

### Scripts

| Script                   | What it does                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `npm run dev`            | Start the Vite dev server                                            |
| `npm run mock`           | Serve a Prism mock of the contract on port 4010                      |
| `npm run build`          | Type-check and build for production into `dist/`                     |
| `npm run preview`        | Serve the production build locally                                   |
| `npm run lint`           | Run ESLint                                                           |
| `npm run typecheck`      | Run `tsc --noEmit`                                                   |
| `npm test`               | Run the Vitest tests once                                            |
| `npm run contract:types` | Generate `src/api/schema.d.ts` from `contract/openapi.yaml`          |
| `npm run contract:check` | Fail if `contract/openapi.yaml` differs from the service repo's copy |
| `npm run contract:sync`  | Copy the latest contract from the service repo                       |

### The contract

`contract/openapi.yaml` is a copy from the service repo. **It is never edited here.** Fisayo makes any changes, and they are recorded in the service repo's [docs/decisions.md](https://github.com/Fisayomii/Bloodlink/blob/main/docs/decisions.md). After a change, run `npm run contract:sync`, then `npm run contract:types`.

## Deployment

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every pull request and on every push to `main`:

| Job                  | Runs                                  | When                                    |
| -------------------- | ------------------------------------- | --------------------------------------- |
| Check API contract   | `npm run contract:check`              | Every PR and push                       |
| Verify app           | lint, typecheck, test, build          | Every PR and push                       |
| Deploy to Vercel     | `vercel pull`, `vercel build`, `vercel deploy --prebuilt --prod` | Push to `main`, after both jobs pass |

Vercel's own Git deployments are turned off in `vercel.json`, so Actions is the only way the site deploys.

**GitHub repository secrets:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

**Vercel environment variables** (Project Settings > Environment Variables): set `VITE_API_URL` to the service URL. Vite bakes it in at build time, so you must redeploy after changing it.

## Project structure

```text
src/
├── api/               API client, endpoint functions, types generated from the contract
├── auth/              Session context: sign-in, sign-out, current user and role
├── components/        App-level pieces: layout, request status badge, URL-synced filter
│   └── form/          Formik-bound fields, form alerts, API-error-to-field mapping
├── hooks/             useAsync and useIdempotencyKey
├── lib/               Labels and Yup validation, with tests
├── pages/             One file per route: login, availability, units, requests
└── shared/ui/         Design-system primitives: button, input, dialog, toast and more
```

## Accessibility

- Every form control has a visible label.
- Error messages are linked to their fields with `aria-describedby`.
- Focus is always visible, and it moves to the right place after navigation and errors.
- Every interactive control is at least 44px tall.
- A "Skip to main content" link is the first element keyboard users reach.

## Team

- Ufoma Onowho: interface (this repo)
- Fisayo and Daniel: service ([Fisayomii/Bloodlink](https://github.com/Fisayomii/Bloodlink))
