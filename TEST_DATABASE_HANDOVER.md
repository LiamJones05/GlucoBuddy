# Test Database Handover

## Purpose

Provide a repeatable, safe local test-database setup for GlucoBuddy when the development environment is recreated on a new machine or VM.

## Current problem

`npm test --prefix glucobuddy-backend` connects to PostgreSQL using `glucobuddy-backend/.env.test`.

The configured target is:

```text
host:     localhost
port:     5432
database: glucobuddy_test
```

The Docker Compose PostgreSQL service is healthy and exposes port `5432`, but it creates only the database named by `POSTGRES_DB` on first initialisation. It does not create `glucobuddy_test` automatically.

As a result, every test currently stops in `tests/setup.js` before its assertions run with:

```text
error: database "glucobuddy_test" does not exist
```

This is an environment/bootstrap issue, not 178 independent test failures.

## Why the test database must be separate

The test setup truncates application tables before every test. The test runner must never use the development database.

Keep both databases in the same local Postgres container:

```text
Postgres container
├── <development database from POSTGRES_DB>
└── glucobuddy_test
```

## Recommended solution

Mount an init script and the existing schema into the official Postgres image. On a fresh Docker volume, the image will:

1. Create the normal development database from `POSTGRES_DB`.
2. Create `glucobuddy_test`.
3. Load `glucobuddy-backend/schema.sql` into both databases.

### Compose change

Under `services.postgres.volumes` in `docker-compose.yml`, retain the named volume and add these mounts:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
  - ./docker/postgres/01-create-test-db.sh:/docker-entrypoint-initdb.d/01-create-test-db.sh:ro
  - ./glucobuddy-backend/schema.sql:/docker-entrypoint-initdb.d/02-schema.sql:ro
```

### Init script

Create `docker/postgres/01-create-test-db.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
CREATE DATABASE glucobuddy_test;
SQL

psql --username "$POSTGRES_USER" --dbname glucobuddy_test --set ON_ERROR_STOP=1 \
  < /docker-entrypoint-initdb.d/02-schema.sql
```

Make the script executable:

```bash
chmod +x docker/postgres/01-create-test-db.sh
```

The mounted `02-schema.sql` is also processed by the image after `01-create-test-db.sh`, initialising the default development database.

## Important limitation

The official Postgres image runs scripts in `/docker-entrypoint-initdb.d` only when its data directory is empty. This is intentional: it avoids overwriting existing development data on subsequent container starts.

Therefore:

- On a new VM/device: `docker compose up -d` creates both databases automatically.
- On an existing volume: create and initialise `glucobuddy_test` once using the commands below.
- Do not delete the `postgres_data` volume unless you deliberately want to erase all local development and test data.

## One-time setup for the current container

From the repository root in a Bash/WSL terminal:

```bash
set -a
. ./.env
set +a

docker compose exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -U "$DB_USER" \
  -d postgres \
  -c 'CREATE DATABASE glucobuddy_test;'

docker compose exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -U "$DB_USER" \
  -d glucobuddy_test \
  < glucobuddy-backend/schema.sql
```

If `CREATE DATABASE` reports that `glucobuddy_test` already exists, skip that command and run the schema-import command only.

## Verification

Confirm the schema exists:

```bash
docker compose exec -T postgres psql \
  -U "$DB_USER" \
  -d glucobuddy_test \
  -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

Then run:

```bash
npm test --prefix glucobuddy-backend
```

## Related configuration note

`glucobuddy-backend/migration-config.js` previously contained typos in its CommonJS export and database variable name. Confirm it now uses `module.exports` and `process.env.DB_DATABASE` before relying on migration commands for future schema changes.
