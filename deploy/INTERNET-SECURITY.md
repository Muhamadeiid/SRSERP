# Public Internet Deployment Gate

Local source fixes are not proof that a live deployment is secure. Do not expose
the existing HTTP/LAN setup directly to the Internet.

1. Take a database and private-storage backup and verify restore on an isolated copy.
2. Configure a real domain and valid TLS certificate in `nginx.https.conf`. Run
   `nginx -t` before enabling it. This template proxies Docker's frontend, which
   already proxies `/api` to the private API container.
3. Keep database, API and frontend upstream ports bound to loopback. Firewall
   incoming traffic to 443 and HTTP-to-HTTPS redirect only; restrict administration
   to VPN/approved management addresses. Do not publish phpMyAdmin, dev servers,
   RDP or RustDesk management endpoints as application services.
4. Set `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://YOUR_DOMAIN`,
   `SRS_REQUIRE_HTTPS=true`, and exact `TRUSTED_PROXIES` addresses for every proxy
   hop as seen by Laravel. Never use `*`. The supplied public edge overwrites
   client forwarding headers. Confirm Docker's frontend forwards these correctly
   before enabling the HTTPS requirement. Misconfiguration intentionally fails closed.
5. Bearer sessions now expire after 720 minutes by default; configure a positive
   `SANCTUM_EXPIRATION` in minutes if company policy requires a different duration.
   Use `/api` for both frontend API settings. Rebuild the frontend after changing
   build-time configuration. Limit `FRONTEND_ORIGINS` to required origins.
6. Rotate previously shared/default credentials without changing APP_KEY blindly:
   existing encrypted data may depend on it. Provision a least-privileged database
   account; the existing Docker API still uses root and needs an operator-led
   migration against the existing volume. Do not recreate or delete that volume.
7. Verify externally: HTTP redirects; HTTPS certificate is valid; upstream/DB ports
   are unreachable; `.env`, `.git`, backups and private uploads cannot be fetched;
   login throttling works; staff cannot read HR data or choose PRF numbers; legitimate
   forms/approvals/export work. Test using dedicated test accounts, not employee data.
8. Run current dependency advisory checks in an approved network environment and
   patch supported versions with regression tests. Keep server security updates,
   backup monitoring and access-log alerting operational.

No TLS certificate, firewall, live service, company data or server account was
changed by these repository edits. Do not run an unattended production update
until the loopback binding and TLS transition are prepared.
