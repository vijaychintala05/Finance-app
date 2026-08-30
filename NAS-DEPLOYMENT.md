# FirmBooks on MinisCloud Personal Pool

## Deployment folder

Create a folder named `FirmBooks` in Personal Pool and place this repository in
that folder. The Compose stack stores PostgreSQL data in
`FirmBooks/nas-data/postgres`, so the accounting database remains on Personal
Pool when containers are replaced or upgraded.

## First deployment

1. Copy `.env.nas.example` to `.env` in the `FirmBooks` folder.
2. Replace both placeholder secrets. Use a long alphanumeric PostgreSQL
   password and a separate random JWT secret of at least 32 characters.
3. In MinisCloud, open Docker and create a Compose application from
   `compose.nas.yaml` in the Personal Pool `FirmBooks` folder.
4. Start the application and wait until both `database` and `app` are healthy.
5. On the local network, open `http://192.168.1.9:55000/api/readyz`. It should
   report `status: ready` before opening `http://192.168.1.9:55000`.

Do not expose PostgreSQL port `5432`. Do not router-forward port `55000` directly
to the internet. For access away from home, use a private VPN such as Tailscale
or MinisCloud's authenticated remote-access feature. Use an HTTPS reverse proxy
with a real hostname only when public access is required.

## Backups

Before every application update, stop the app container and create a ZFS
snapshot of the Personal Pool `FirmBooks/nas-data/postgres` dataset/folder. Also
keep an encrypted backup on a second device; a snapshot on the same NAS is not a
complete backup.
