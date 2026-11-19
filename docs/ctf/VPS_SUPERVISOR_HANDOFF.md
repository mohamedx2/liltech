# LilTech 2026 Mini-CTF — VPS Supervisor Handoff Report

**Date:** 2026-11-19

**Target environment:** Production VPS

**Implementation branch:** `feat/participant-challenges`

**Pull request:** <https://github.com/mohamedx2/liltech/pull/new/feat/participant-challenges>

## 1. Purpose

This report describes the infrastructure and operational steps required after
the Mini-CTF production-readiness changes are deployed.

The Mini-CTF is now controlled by the authoritative event phase:

- It remains closed during `registration` and `checkin`.
- An administrator opens it from the platform by moving the event to `live`.
- It closes when the event leaves `live`, including during
  `submissions_closed`, `pitching`, and `results`.
- The VPS supervisor provisions the stages and secrets but does not manually
  start the CTF or modify the event phase in PostgreSQL.

## 2. Critical action before merging

Merging to `main` deploys automatically because `DEPLOY_ENABLED=true`.
Therefore, the production pepper must exist before the pull request is merged.

Generate it on a secure machine:

```bash
openssl rand -base64 48
```

Add the generated value to GitHub Actions as a repository secret with this
exact name:

```text
CTF_ANSWER_PEPPER
```

Store the same value in the organization's approved password or secret
manager. Never send it through chat, email, screenshots, tickets, or logs.

## 3. Prepare the private answers file

Replace `<DEPLOY_USER>` below with the Linux account used by GitHub Actions to
deploy the platform.

```bash
sudo mkdir -p /opt/liltech/secrets
sudo chown <DEPLOY_USER>:<DEPLOY_USER> /opt/liltech/secrets
sudo chmod 700 /opt/liltech/secrets
```

Create the following private file outside the Git repository:

```text
/opt/liltech/secrets/ctf-answers.json
```

Expected structure:

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
    }
  }
}
```

The real file must contain all seven stages, from `louage-404-01` through
`louage-404-07`.

Protect the file:

```bash
sudo chown <DEPLOY_USER>:<DEPLOY_USER> /opt/liltech/secrets/ctf-answers.json
sudo chmod 600 /opt/liltech/secrets/ctf-answers.json
```

The file must never be committed, copied into a Docker image, or printed in CI
or application logs.

## 4. Post-deployment checks

After the GitHub Actions deployment finishes, connect to the VPS and check the
stack:

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

Do not print the production `.env` file or the pepper during verification.

## 5. Provision the Mini-CTF

Provisioning is intentionally separate from normal deployments. Run the
operator-only Compose profile:

```bash
cd /opt/liltech
docker compose -f docker-compose.prod.yml \
  --profile ctf-operations \
  run --rm ctf-provision
```

The operation is idempotent and may be rerun after correcting the private JSON
file.

Successful output must confirm:

- Seven LOUAGE 404 stages were provisioned.
- Every live stage reports `answerConfigured=yes`.
- The pepper is reported as present.
- No unknown stage is referenced.
- No Google Drive URL is rejected.

Do not launch the event if provisioning reports a missing answer or any other
error.

## 6. Event-night acceptance test

Coordinate with an administrator and use non-production test team accounts.

1. Check in one test team.
2. Before launch, open the team Mini-CTF page.
3. Confirm that no stage content is visible and the platform explains that an
   administrator must start the event.
4. Confirm that no CTF progress or attempt is created before launch.
5. From the admin control panel, select **Start event & open Mini-CTF**.
6. Read and accept the confirmation explaining that checked-in teams receive
   immediate access.
7. Confirm that stage 1 opens for the checked-in test team.
8. Confirm that an unchecked team remains blocked.
9. Submit a known test answer and confirm that validation works without a 500
   response.
10. Move the event to `submissions_closed` in the admin interface.
11. Confirm that stage reads, hints, and answer submissions are rejected.

Only an administrator starts or closes the CTF through the platform. The VPS
supervisor must not modify the event phase directly in the database.

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

Never update only the API pepper or only the database hashes.

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

## 9. Completion checklist

- [ ] `CTF_ANSWER_PEPPER` exists in GitHub Actions before merge.
- [ ] The pepper is stored in the approved secret manager.
- [ ] `/opt/liltech/secrets/ctf-answers.json` contains all seven stages.
- [ ] The answers file is owned by the deployment user and has mode `600`.
- [ ] The deployment completed successfully.
- [ ] API and database containers are healthy.
- [ ] The CTF provisioner completed without errors.
- [ ] Every live stage reports `answerConfigured=yes`.
- [ ] Pre-launch access is blocked.
- [ ] The admin interface opens the CTF when the event enters `live`.
- [ ] Moving beyond `live` blocks hints and submissions.
- [ ] No production secret or plaintext answer appeared in logs.
