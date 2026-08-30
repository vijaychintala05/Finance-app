# NAS Deployment

This project keeps development and NAS production deployment separate:

```text
feature branches -> main -> nas-deploy -> NAS
```

`main` is the release source. `nas-deploy` is the only branch the NAS checks
out. Do not develop directly on `nas-deploy`, and do not store production
secrets in Git.

## First-time branch setup

Run this from a clean checkout after the current development work has been
committed or otherwise safely saved:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c nas-deploy
git push --set-upstream origin nas-deploy
```

If `nas-deploy` already exists locally, use `git switch nas-deploy` instead of
creating it again.

## Release to NAS

Run the release checks on the development machine, then promote only the
tested `main` commit:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
git switch nas-deploy
git merge --ff-only main
git push origin nas-deploy
```

The `--ff-only` requirement prevents an accidental merge of unreviewed NAS
changes. If it fails, inspect the branch histories and resolve that release
decision deliberately.

## NAS setup

The NAS needs Node.js 22+, PostgreSQL 15+, Git, and optionally PM2. On the NAS:

```bash
git clone --branch nas-deploy <repository-url> firmbooks
cd firmbooks
cp deploy/nas/env.example .env
chmod 600 .env
npm ci
npm run build
```

Edit `.env` with the NAS PostgreSQL URL, a unique 32+ character `JWT_SECRET`,
the NAS HTTPS origin in `ALLOWED_ORIGINS`, and the correct proxy settings. Keep
the database outside the Git checkout and enable scheduled PostgreSQL backups.

For each release, run `deploy/nas/deploy.sh` from the repository root while on
the `nas-deploy` branch. It fetches with fast-forward-only behavior, installs
the lockfile dependencies, builds the production bundle, prunes development
dependencies, and restarts the PM2 process when PM2 is installed.

Without PM2, stop the previous process and start the built server with:

```bash
NODE_ENV=production npm start
```

## Health check and rollback

After deployment, verify:

```bash
curl -fsS http://127.0.0.1:3000/api/healthz
curl -fsS http://127.0.0.1:3000/api/readyz
```

`readyz` must report a healthy database and the expected migration state before
the NAS is considered live. To roll back, identify the last known-good
`nas-deploy` commit, check it out, rebuild, and restart the process. Then fix
the release branch before promoting it again.

## Branch protection recommendations

- Protect `main` and `nas-deploy` on the Git host.
- Require pull requests and passing verification checks for `main`.
- Allow updates to `nas-deploy` only from reviewed release changes.
- Keep NAS `.env`, database files, uploads, logs, and backups outside commits.
- Tag each production release, for example `v1.0.1`.
