# LilTech 2026 Mini-CTF — VPS Supervisor Handoff Report

**Last updated:** 2026-11-20

**Target environment:** Production VPS

**Implementation branch:** `feat/participant-challenges`

**Pull request:** <https://github.com/mohamedx2/liltech/pull/new/feat/participant-challenges>

## 1. Purpose

This is the production handoff checklist for the DevOps engineer or VPS
supervisor responsible for deploying and provisioning the Mini-CTF. Complete
the pre-merge actions before approving the pull request, then complete the
post-deployment and event-night checks in order.

The responsibilities are deliberately separated:

- GitHub Actions deploys the application and supplies the server-only pepper.
- The VPS supervisor protects and provisions the private answer material.
- An administrator starts and closes the event through the web interface.
- The application—not the supervisor or frontend—enforces eligibility,
  timing, stage progression, and flag validation.

The Mini-CTF is now controlled by the authoritative event phase:

- It remains closed during `registration` and `checkin`.
- An administrator opens it from the platform by moving the event to `live`.
- It closes when the event leaves `live`, including during
  `submissions_closed`, `pitching`, and `results`.
- The VPS supervisor provisions the stages and secrets but does not manually
  start the CTF or modify the event phase in PostgreSQL.

## 2. Before merging the pull request

Merging to `main` deploys automatically because `DEPLOY_ENABLED=true`. The
production API now validates `CTF_ANSWER_PEPPER` during startup, so the secret
must exist before the merge. Otherwise the newly deployed API will fail fast
instead of serving requests with an invalid CTF configuration.

1. Generate a strong pepper on a secure machine:

```bash
openssl rand -base64 48
```

2. Add the generated value under **Settings → Secrets and variables → Actions**
   as a repository secret with this exact name:

```text
CTF_ANSWER_PEPPER
```

3. Store the same value in the organization's approved password or secret
   manager. Never send it through chat, email, screenshots, tickets, or logs.

The pepper is not a flag and must not be added to `ctf-answers.json`. It is a
server-side HMAC key used to derive the answer digests stored in PostgreSQL.
Changing it without re-provisioning makes every existing answer digest
unverifiable.

## 3. Prepare the VPS and private answers file

Replace `<DEPLOY_USER>` below with the Linux account used by GitHub Actions to
deploy the platform. Do not literally create a user named `<DEPLOY_USER>`.

```bash
sudo mkdir -p /opt/liltech/secrets
sudo chown <DEPLOY_USER>:<DEPLOY_USER> /opt/liltech/secrets
sudo chmod 700 /opt/liltech/secrets
```

Create the following private file outside the Git repository:

```text
/opt/liltech/secrets/ctf-answers.json
```

The file must contain all seven canonical stage slugs. Replace every answer and
Drive URL placeholder with organizer-approved values; do not use example or
unconfirmed answers in production.

```json
{
  "stages": {
    "louage-404-01": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    },
    "louage-404-02": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    },
    "louage-404-03": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    },
    "louage-404-04": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    },
    "louage-404-05": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    },
    "louage-404-06": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    },
    "louage-404-07": {
      "answer": "<PRIVATE-ANSWER>",
      "assetDriveUrl": "https://drive.google.com/..."
    }
  }
}
```

Only HTTPS links hosted on `drive.google.com` or `docs.google.com` are accepted.
The provisioner rejects unknown slugs and invalid hosts before publishing
unsafe links.

Protect the file:

```bash
sudo chown <DEPLOY_USER>:<DEPLOY_USER> /opt/liltech/secrets/ctf-answers.json
sudo chmod 600 /opt/liltech/secrets/ctf-answers.json
```

Mode `700` on the directory limits traversal to its owner. Mode `600` on the
file limits reads and writes to its owner. The file must never be committed,
copied into a Docker image, or printed in CI or application logs.

## 4. After the deployment finishes

After GitHub Actions reports a successful deployment, connect to the VPS and
check the running stack:

```bash
cd /opt/liltech
docker compose -f docker-compose.prod.yml ps
```

Review API startup logs:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

The API must not report:

- Missing or invalid `CTF_ANSWER_PEPPER`
- Invalid environment configuration
- Database migration failure
- Repeated container restarts

Also confirm that the deployment applied all Prisma migrations. A new API image
must never run against an older database schema; that mismatch produces HTTP
500 errors on participant and event-state requests.

Do not use `cat`, `printenv`, `docker inspect`, or shell tracing to expose the
production `.env`, the pepper, or the answers file during verification. The
container status and redacted API logs are sufficient.

## 5. Provision the Mini-CTF answers and Drive resources

Provisioning is intentionally separate from normal deployments. The
recommended path needs no SSH: update the `CTF_ANSWERS_JSON` repository secret
with the complete answers file, then run the manual **Provision Mini-CTF**
workflow (`.github/workflows/ctf-provision.yml`). It writes
`/opt/liltech/secrets/ctf-answers.json` (`700`/`600`) and runs the profile
below. See `docs/ctf/README.md`.

To run the operator-only Compose profile by hand on the VPS:

```bash
cd /opt/liltech
docker compose -f docker-compose.prod.yml \
  --profile ctf-operations \
  run --rm --user "$(id -u):$(id -g)" ctf-provision
```

`--user` is required: Compose mounts the secret with the host file's owner and
mode, so the image's `appuser` cannot read a `600` file it does not own.

The operation is idempotent: it upserts the same seven stages and answer
digests instead of creating duplicates. It may be safely rerun after correcting
the private JSON, as long as the same production pepper remains configured.

Successful output must confirm:

- Seven LOUAGE 404 stages were provisioned.
- Every live stage reports `answerConfigured=yes`.
- The pepper is reported as present.
- No unknown stage is referenced.
- No Google Drive URL is rejected.

Do not launch the event if provisioning reports a missing answer or any other
error.

Provisioning does not open the Mini-CTF. It only prepares the stage content,
answer digests, hints, and Drive resources. The event remains closed until an
administrator starts it from the platform.

## 6. Event-night acceptance test

Coordinate with an administrator and use non-production test team accounts.

1. Keep the event in `checkin` and prepare two non-production teams: one
   checked in and one not checked in.
2. Before launch, open `/team/ctf` as the checked-in team.
3. Confirm that the page says the Mini-CTF has not started and that no stage
   content is visible.
4. Confirm that requesting hints or submitting flags before launch is rejected
   and does not create progress or attempts.
5. From the admin control panel, select **Start event & open Mini-CTF**.
6. Read and accept the confirmation explaining that checked-in teams receive
   immediate access.
7. Confirm that stage 1 opens for the checked-in test team and its configured
   Drive link opens in a separate tab.
8. Confirm that the unchecked team remains blocked.
9. Submit one deliberately incorrect flag and confirm that the participant sees
   a safe error while the attempt counter increases.
10. Submit the organizer-approved stage 1 answer and confirm that stage 2
    unlocks without exposing the stored digest or plaintext answer.
11. Move the event to `submissions_closed` in the admin interface.
12. Confirm that stage reads, hints, and answer submissions are rejected.

Only an administrator starts or closes the CTF through the platform. The VPS
supervisor must not modify the event phase directly in the database.

If any check fails, keep the event outside `live`, capture redacted API logs and
the request ID, and escalate to the development team. Do not improvise a direct
database change on event night.

## 7. Pepper rotation procedure

Do not rotate `CTF_ANSWER_PEPPER` during an ordinary deployment. Existing
answer hashes depend on the current pepper.

If rotation is required:

1. Schedule a maintenance window.
2. Generate a new secure pepper.
3. Update the GitHub Actions `CTF_ANSWER_PEPPER` secret.
4. Deploy the API with the new value.
5. Re-run the CTF provisioner using the complete private answers file.
6. Verify all seven stages before allowing the administrator to start the
   event.

Never update only the API pepper or only the database hashes. Rotation is one
coordinated operation: secret update, deployment, full seven-stage
re-provisioning, then acceptance verification.

## 8. Safety and rollback rules

Do not execute destructive commands such as:

```bash
docker compose down -v
```

Also prohibited without an approved recovery plan:

- Prisma database reset commands
- Deleting Docker volumes
- Recreating the PostgreSQL volume
- Manually editing answer hashes
- Logging or displaying the pepper or plaintext answers
- Starting the CTF by directly changing PostgreSQL records

If provisioning fails, leave the event outside the `live` phase, correct the
private JSON file, and rerun the idempotent provisioner. Do not delete existing
production data.

## 9. Troubleshooting guide

### API refuses to start

Check the redacted API logs for environment validation. Confirm that the
`CTF_ANSWER_PEPPER` GitHub secret exists, contains at least 16 characters, and
is included when the deployment creates the production environment. Do not
print its value.

### Provisioner reports a missing answer

Confirm that every stage intended to be `live` has a non-empty `answer` in the
private JSON. Keep any unconfirmed stage in `draft`; never publish a guessed
answer merely to make provisioning pass.

### Provisioner rejects a Drive URL

Use an HTTPS Google Drive or Google Docs URL. Links from URL shorteners,
unapproved hosts, or malformed folder IDs are rejected intentionally.

### Participant requests return HTTP 500 after deployment

Check whether Prisma migrations completed before investigating application
logic. Do not reset the database. Apply the reviewed production migrations and
retest the health, event-state, and participant endpoints.

### Flags fail after a pepper change

Stop the event workflow and re-provision all seven stages with the complete
private answers file and the currently deployed pepper. Do not edit
`answerHash` values manually.

## 10. Completion checklist

- [ ] `CTF_ANSWER_PEPPER` exists in GitHub Actions before merge.
- [ ] The pepper is stored in the approved secret manager.
- [ ] `/opt/liltech/secrets/ctf-answers.json` contains all seven stages.
- [ ] The answers file is owned by the deployment user and has mode `600`.
- [ ] The deployment completed successfully.
- [ ] All reviewed Prisma migrations were applied successfully.
- [ ] API and database containers are healthy.
- [ ] The CTF provisioner completed without errors.
- [ ] Every live stage reports `answerConfigured=yes`.
- [ ] Every configured Drive URL passed validation.
- [ ] Pre-launch access is blocked.
- [ ] A checked-in test team can open stage 1 only after admin launch.
- [ ] An unchecked test team remains blocked.
- [ ] A correct test flag advances the chain without a server error.
- [ ] The admin interface opens the CTF when the event enters `live`.
- [ ] Moving beyond `live` blocks hints and submissions.
- [ ] No production secret or plaintext answer appeared in logs.
