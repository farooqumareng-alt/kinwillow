# KinWillow Android app

The Android app is a Trusted Web Activity: a thin, signed wrapper that opens
`https://www.kinwillow.com/app` full-screen. It contains no vault code of its
own, so it updates whenever the website deploys. A new app build is only
needed to change the name, icon, colours or Android settings.

Everything here is generated from `twa-manifest.json` by
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) in GitHub Actions
(`.github/workflows/android.yml`). Nothing else in this folder is committed.

## Building

GitHub → Actions → **Android app** → Run workflow. When it finishes, download
the `kinwillow-android` artifact: it contains `app-release-bundle.aab` (upload
this to Play Console) and an `.apk` for testing on a phone.

The build is signed when these two repository secrets exist (Settings →
Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the upload keystore (`.p12`), base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | its password (keystore and key share it) |

Without them the workflow still runs and produces an unsigned build, which is
only useful as a check that the toolchain works. Play Console rejects unsigned
uploads.

Each run uses the run number as the version code, so every build can be
uploaded without editing anything. To change the version name shown to users,
edit `appVersion` in `twa-manifest.json`.

## Linking the app to the site

After the first upload, copy the **App signing key certificate** SHA-256
fingerprint from Play Console → Setup → App signing into the Vercel variable
`ANDROID_CERT_SHA256` and redeploy. The site then serves it at
`/.well-known/assetlinks.json`. Until that is done the app works but shows a
browser address bar.

To test an `.apk` installed directly on a phone, add the upload key's
fingerprint as well, comma-separated.
