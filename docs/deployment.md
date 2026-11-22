# Deployment Notes

## Status

No hosting provider, domain, TLS terminator, or production topology has been selected. The application is prepared to use configurable settings but is not a production deployment. Before launch, confirm the actual network path from client to proxy to API and review proxy trust, CORS, cookies, MongoDB connectivity, backups, monitoring, and TLS settings.

## Local development

1. Install Node.js 22.12 or newer and npm 10 or newer.
2. Copy `.env.example` to `.env`; do not commit `.env`.
3. Optionally start MongoDB locally and set `MONGODB_URI=mongodb://127.0.0.1:27017/harf_experimental`. Set `MONGODB_DATABASE=harf_experimental`; this is the non-production default and can be overridden for other local databases. For Atlas, set the private `MONGODB_URI` in `.env`. If the operating system resolver cannot resolve Atlas SRV/TXT records, optionally set `MONGODB_DNS_SERVERS` to a reachable DNS resolver IP (for example, `8.8.8.8`); this applies to the Node process only. The API can start without a database in development, but readiness remains 503 until one is connected.
4. Run `npm install`.
5. Initialize the experimental database explicitly with `npm run db:init:experimental -- --mode=experimental` from the repository root. The command requires `MONGODB_DATABASE=harf_experimental`, refuses production mode, and is not run during API startup or requests.
6. Run `npm run dev`.
7. Open the Vite URL printed by the development server. Local HTTP is supported for development only; use synthetic credentials/data and never submit real passwords, child records, payment evidence, or consultation information over plain HTTP.
8. Configure a test SMTP account in `.env` to exercise email verification and password recovery. Account APIs clearly return 503 if MongoDB is unavailable.
9. After database initialization, provision the first administrator with `npm run admin:create --workspace @harf/api` in an interactive terminal. The password prompt does not echo input; no admin can be created over HTTP.

Vite uses the hostname/port from `APP_ORIGIN` and proxies same-origin `/api` requests to `VITE_DEV_API_TARGET`. It uses a strict port so it fails rather than silently switching to an origin not allowed by the API CORS list. Set `APP_ORIGIN`, `CLIENT_ORIGINS`, and `VITE_DEV_API_TARGET` consistently if local addresses change. The API URL is not embedded in page components.

## MongoDB database configuration

The API connects through Mongoose in `apps/api/src/db/mongo.js`; only the API server connects to MongoDB. `MONGODB_DATABASE` selects the database independently from `MONGODB_URI`. Non-production environments default to `harf_experimental`; production must explicitly select a different database name. The React app must never receive database credentials.

The initializer does not reset collections and must never be used for production. Confirm the URI targets the intended experimental Atlas cluster before running it.

For secure browser testing, set `APP_ORIGIN` and `CLIENT_ORIGINS` to the exact HTTPS origin, then provide both `VITE_HTTPS_KEY_FILE` and `VITE_HTTPS_CERT_FILE` in the untracked `.env` with paths to a trusted local certificate/key pair. Vite loads the files only in development server mode; the key must stay outside source control. Use a hostname covered by the certificate. Configure the API proxy target to the API/reverse-proxy URL used in that test. No certificate, private key, or self-signed trust bypass is included in the repository.

## Secure testing and production

- Terminate HTTPS at a reviewed deployment edge or run the API behind a TLS-capable server. This project does not invent certificate paths or a reverse-proxy configuration.
- Serve the browser application and API over HTTPS. Configure `APP_ORIGIN` and every comma-separated `CLIENT_ORIGINS` entry with exact HTTPS origins; production configuration rejects HTTP origins.
- For same-origin deployment, route `/api` to the API and leave `VITE_API_BASE_URL` empty. For a separate API origin, set `VITE_API_BASE_URL` to its HTTPS origin at frontend build time and explicitly allow the frontend HTTPS origin in `CLIENT_ORIGINS`.
- Do not redirect API HTTP requests inside Express. In production, non-health API requests over a request the app does not recognize as secure are rejected with a JSON error. This avoids proxy redirect loops and prevents treating an untrusted forwarded header as proof of HTTPS.
- The API trusts no proxy by default. Set `TRUST_PROXY` only to the actual trusted proxy address/subnet or a reviewed Express preset/hop count for the known topology. Avoid broad `true` trust and unreviewed hop counts. If TLS is terminated by a proxy and trust is not configured correctly, secure production requests will be rejected; this is intentional fail-closed behavior.
- Production Helmet HSTS behavior is enabled. In development, HSTS is disabled to avoid persisting HTTPS-only policy for a local HTTP workflow.
- Authentication uses an HttpOnly, Secure, SameSite=Lax session cookie in production (`__Host-harf.sid`) and a non-Secure local cookie in development. The session value is random and only its SHA-256 digest is stored. The deployment should keep the browser and API same-site; a cross-site deployment would require an explicit cookie policy review because SameSite=Lax will not support cross-site credentialed fetches.
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and optional paired SMTP user/password values in the deployment secret manager. Do not commit real credentials. Production startup requires SMTP host/from.
- The same SMTP transport sends optional generic notification email. In-app notifications remain persisted if delivery fails; review API logs and provider telemetry for delivery failures. Notification messages must not include child details, payment receipts, private specialist notes, or consultation reports.
- The current auth rate limiters use an in-memory store. This is suitable only for a single API process; configure a shared store before running multiple instances, or limits will not be consistent across instances/restarts.
- The API does not create indexes or seed records during normal startup. Run the explicit experimental initializer only for the experimental database. Production index changes require a separately reviewed operational process.
- Set `MEDIA_STORAGE_DIR` to a durable private directory outside the web server's static/public paths. The default is a sibling `harf-media` directory outside the workspace. Back up files together with MongoDB metadata, restrict filesystem access, and test restore and capacity monitoring before publishing assets.
- Keep MongoDB on a private network and use deployment secret storage for its URI. Production requires both `MONGODB_URI` and an explicit `MONGODB_DATABASE` other than `harf_experimental`; automatic Mongoose index creation is disabled in production.
- Live meetings use Jitsi's IFrame API. `JITSI_DOMAIN` defaults to `meet.jit.si`; `JITSI_PARENT_EARLY_JOIN_MINUTES` (10), `JITSI_SPECIALIST_EARLY_JOIN_MINUTES` (15), and `JITSI_POST_APPOINTMENT_GRACE_MINUTES` (30) are enforced by the API. A room name is opaque and unpredictable, but the public Jitsi service does not guarantee participant-only access or authenticate a caller against the Haraf booking. Do not treat the default public service as sufficient for confidential production consultations. Review child-data processing, geography, retention, cost, and terms; for actual access control, configure an authenticated/self-hosted Jitsi deployment and implement/verify its server-side JWT/moderator setup before launch. No signing key is exposed to the browser and JWT issuance is not implemented here.
- Admin video tests use `VIDEO_TEST_LIFETIME_MINUTES` (default 30, allowed 5–60). Expiry prevents further Haraf API access and consumes temporary second-participant tokens; it cannot close a room on public Jitsi. The one-use link is only an additional application-level gate, not provider room authentication. Test records do not contain media or recordings.
- The frontend loads `https://<JITSI_DOMAIN>/external_api.js` only after a participant explicitly chooses to join. Configure the deployed frontend Content Security Policy to allow the selected Jitsi host in `script-src` and `frame-src`, then test the exact deployment's required WebSocket/media connection hosts under `connect-src` and related directives. Do not broadly weaken CSP. Serve both the app and API over HTTPS; Jitsi camera/microphone permissions are requested only after the user enters the meeting flow.
- Set `HOST` to an address reachable by the deployment's routing layer (often `0.0.0.0` in a container) only after the runtime/network boundary is defined. The default binds to loopback.
- Configure TLS certificates, certificate renewal, security group/firewall rules, backups, retention, and monitoring according to the selected host. None are provisioned in this repository.

## Experimental Vercel deployment

Configure the Vercel Project Root Directory as the repository root (`.`) and the framework preset as Vite. The root `vercel.json` installs all npm workspaces with `npm ci --include=dev`, runs `npm run build`, and serves the Vite output from `apps/web/dist`. The root `api/[...path].js` exposes the existing Express serverless handler as one catch-all Node.js Function; it delegates to the shared API bootstrap without duplicating routes or middleware. API paths remain `/api/v1/*`. The SPA rewrite excludes `/api`, `/assets`, and paths with file extensions so API calls and missing static assets do not receive the SPA HTML fallback.

Set deployment variables through Vercel's Environment Variables settings. Do not copy production credentials into Preview or Development environments.

Required for the production-mode API configuration:

- `NODE_ENV`: `production`.
- `MONGODB_URI`: the Vercel experimental cluster connection URI, kept private.
- `MONGODB_DATABASE`: a database dedicated to Vercel experimentation and distinct from Hostinger production. The Phase 3A production guard rejects `harf_experimental` when `NODE_ENV=production`; use a separate experimental name such as `harf_vercel_experimental`.
- `APP_ORIGIN`: the deployed HTTPS origin.
- `CLIENT_ORIGINS`: comma-separated exact HTTPS browser origins; include `APP_ORIGIN`.
- `SMTP_HOST` and `SMTP_FROM`. `SMTP_PORT` and `SMTP_SECURE` have defaults; `SMTP_USER` and `SMTP_PASSWORD` are optional but must be configured together.
- `TRUST_PROXY`: review against Vercel's actual forwarded-proxy path. The API requires trusted HTTPS information in production; verify `request.secure` on a Vercel Preview deployment before accepting traffic.

`VITE_API_BASE_URL` should remain unset/empty for same-origin requests. Session cookies are configured in code as HttpOnly, Secure in production, and SameSite=Lax; there are no separate session or CSRF secrets to configure. CSRF uses the authenticated session token and the `X-CSRF-Token` request header.

`MONGODB_DNS_SERVERS` is optional and only needed if the runtime's resolver cannot resolve the Atlas SRV/TXT records. `HOST` and `PORT` apply to the traditional Express server, not the Vercel Function. Filesystem-backed media and document uploads are not made persistent or Vercel-compatible by this phase; use of those endpoints remains unsupported until storage is redesigned.

## Health endpoints

- `GET /api/v1/health/live` is a lightweight liveness check and can be accessed over HTTP.
- `GET /api/v1/health/ready` returns 200 only when MongoDB reports a connected state; otherwise it returns 503.
- Health endpoints intentionally expose only service/readiness status and no URI, hostname, credentials, or diagnostic stack traces.

## Open deployment decisions

- Hosting provider, public domain, TLS termination, and the proxy's source address.
- Production origin(s), frontend/API topology, and Vite build-time API URL.
- Whether the frontend/API share a site, plus production cookie policy and SMTP provider.
- A shared rate-limit store and distributed deployment policy.
- Private media storage, backup/restore, and upload-rate-limit store.
- Production MongoDB service, network policy, backups, and restoration objectives.
- Secret manager, logging/monitoring, and incident-response ownership.
- Applicable child-data jurisdiction, consent, retention, and deletion policy before accepting real user data.
- Public Jitsi participant-access limitations and provider-specific child-data/privacy, data residency, cost, CSP, and operational review.
