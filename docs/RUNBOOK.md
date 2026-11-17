# VibeLoop — Operations & Incident Runbook

For whoever is on call. Every step names the admin page or command to use.

## 1. Severity

| Severity | Examples | Response |
| --- | --- | --- |
| critical | Child-safety content (blocked-hash hit, scanner `csam`), data breach, all logins failing, data loss | Act now, any hour. Owner + legal informed within 1 h. |
| high | One feature down for everyone, payment failures, mass account takeover | Within 1 h |
| medium | Mass-messaging spam wave, slow API, a failed nightly backup | Same working day |
| low | Single-user problem, cosmetic bug | Next working day |

Auto-opened incidents (admin → **Incidents**): blocklisted-file upload (critical), scanner child-safety flag (critical), mass messaging ≥ 3× the bulk threshold (medium).

## 2. Every incident

1. Open or claim it in admin → **Incidents** and set status **investigating**.
2. Add a timeline note for each action (what, who, when). The audit log (Paper Trail) records staff actions automatically.
3. Contain first, then fix, then explain.
4. Resolve it with a final note: cause, user impact, and follow-up tasks.

## 3. Playbooks

### Child-safety content
1. Don't open, download or forward the file. The blocklist hit already refused the upload.
2. Admin → Members → the account: **Suspend** and **Sign out everywhere**.
3. Admin → **Scan Queue**: block any other files from the account and tick **add to blocklist**.
4. Report to the national authority (India: NCMEC CyberTipline via partner and the cybercrime.gov.in portal; follow counsel's guidance). Keep evidence hashes only, as stored in the incident.

### Account takeover
1. Admin → Members → the account → **Login & security**: **Sign out everywhere**. If the attacker turned on two-factor, also **Reset two-factor**.
2. Tell the owner to sign in and turn on two-factor sign-in.
3. Check Account activity for new devices and look for other accounts signed in from the same IP range.

### Spam wave
1. Admin → **Spam Shield**: review the flags and the watchlist. Use **Restrict** (7 days) or **Suspend**.
2. If it keeps growing: User App Settings → Global → lower `spam.bulkSameText` and `spam.newAccountDmPerHour`, or turn off **Sign-up open** for a while.

### Bad deploy
1. `kubectl rollout undo deployment/vibeloop-api` restores the previous image.
2. If a migration broke data: stop writes (User App Settings → Maintenance mode on), then restore (section 4).

### Outage or maintenance
Turn on User App Settings → Global → **Maintenance mode** with a message. Staff can still use the API.

## 4. Backups

- **Nightly:** `deploy/k8s/backup-cronjob.yaml` runs `scripts/ops/backup-db.sh` (custom-format `pg_dump`, SHA-256, kept 14 days, optional copy to S3).
- **Weekly:** `scripts/ops/restore-test.sh` restores the newest dump into a throwaway database and checks the row counts. If it fails, open a **high** incident: the backups are not safe.
- **Manual:**
  ```
  DATABASE_URL=postgresql://… BACKUP_DIR=./backups scripts/ops/backup-db.sh
  ADMIN_URL=postgresql://…/postgres BACKUP_DIR=./backups scripts/ops/restore-test.sh
  ```
- **Real restore:**
  1. Turn on maintenance mode.
  2. `pg_restore --clean --no-owner -d $DATABASE_URL <dump>`
  3. `alembic upgrade head`
  4. Check `/health/ready`.
  5. Turn off maintenance mode.
- Media files live in `MEDIA_DIR`. Back that volume up with your storage provider's snapshots, on the same 14-day schedule.

## 5. Privacy requests

- Self-service deletion: **Settings → Delete account**. The account is erased after `privacy.deletionGraceDays` (default 30) by the hourly purge job. Admin → Privacy Desk → **fulfil** on a deletion request erases it at once.
- Erasing removes or anonymises personal data. Money records are kept for tax law. Chat messages stay with the other members as "Deleted account".
- Data download: **Settings → Download my data** (JSON).
