# DoseWise — EAS Build & TestFlight runbook

How to build the iOS app on EAS and get it onto TestFlight. The config
(`eas.json`, bundle id, encryption declaration) is already in the repo — these
are the interactive steps that need your Expo and Apple accounts.

## Prerequisites

- **Apple Developer Program** membership, active ($99/yr) — required for TestFlight.
- **Expo account** (free) — sign up at https://expo.dev if you don't have one.
- **eas-cli** installed globally:

  ```bash
  npm install -g eas-cli
  ```

## One-time setup

### 1. Log in to Expo

```bash
eas login
```

### 2. Link the project to EAS

```bash
eas init
```

This creates an EAS project under your account and writes `owner` +
`extra.eas.projectId` into `app.json`. **Commit that change** when it's done:

```bash
git add app.json && git commit -m "Add EAS projectId" && git push
```

## Build for TestFlight

```bash
eas build --platform ios --profile production
```

On the first run EAS handles Apple credentials for you:
- Prompts you to log in with your Apple ID.
- Registers the bundle identifier `com.dosewise.app` in your Developer account.
- Generates the distribution certificate and provisioning profile (stored on EAS).

The build runs on EAS servers (~15–25 min) and produces an `.ipa`. `eas.json`
has `autoIncrement` on the production profile, so the build number bumps
automatically every time — TestFlight never rejects a duplicate.

## Create the App Store Connect record (one time)

Before the first upload, the app must exist in App Store Connect:

1. Go to https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**.
2. Platform **iOS**, Name **DoseWise**, Primary language **English (U.S.)**.
3. Bundle ID — pick **com.dosewise.app** from the dropdown (it appears after the
   first build registered it).
4. SKU — anything unique, e.g. `dosewise`.

## Submit the build to TestFlight

```bash
eas submit --platform ios --profile production --latest
```

EAS asks how to authenticate with App Store Connect — the recommended option is
an **App Store Connect API key** (create one at App Store Connect → Users and
Access → Integrations → App Store Connect API → **+**, role App Manager, download
the `.p8`). Apple ID + app-specific password also works.

`--latest` grabs the build you just made. After upload, Apple processes it for
5–15 min, then it appears under **TestFlight** in App Store Connect.

> Tip: you can combine build + submit in one shot with
> `eas build --platform ios --profile production --auto-submit`.

## Invite testers

In App Store Connect → **TestFlight**:
- **Internal testing** — add people on your team (up to 100, no review needed).
  Fastest path to testing on your own phone.
- **External testing** — public/link testers (needs a short Beta App Review).

Add the **Test Information** (what to test, contact email, and the
`https://dose-wise-beta.vercel.app/privacy.html` policy URL) so external review
passes cleanly.

## Env vars baked into the native build

`eas.json` bakes these `EXPO_PUBLIC_*` values into every native build (all public
— the publishable key is safe in the bundle):

| Var | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://ptdgtemcydlemahaeckx.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` (publishable) |
| `EXPO_PUBLIC_API_BASE` | `https://dose-wise-beta.vercel.app` |

`EXPO_PUBLIC_API_BASE` is the important one: the web build leaves it empty
(same-origin), but the native app must call the full Vercel URL. If you ever move
the API, update it in `eas.json` and rebuild.

## Updating later

- **JS-only change?** A new native build isn't strictly required if you set up
  EAS Update, but for App Store releases just rebuild: bump `version` in
  `app.json` (e.g. `1.0.1`) for a new marketing version; the build number
  auto-increments on its own.
- Rebuild → submit → the new build shows in TestFlight, then promote to the App
  Store when ready.
