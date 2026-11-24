# Running PostHog locally

Dev builds of the desktop app and the VS Code extension send product Analytics events (root ADR [0004](./adr/0004-analytics-events-separate-from-otlp.md)) to a PostHog you run yourself, **outside this repo**. Nothing PostHog-related is in this repo's `compose.yml`. With no token set, analytics is a silent no-op, so you only need this to see events.

PostHog warns that its stack needs about **8 GB of memory**. Keep your PostHog checkout pristine: never commit the files below to it.

## Why the hobby compose needs adapting

PostHog's `docker-compose.hobby.yml` assumes it sits in a parent directory with the checkout at `./posthog/`, plus generated `./compose/` scripts and a GeoIP file in `./share/` (all created by `bin/deploy-hobby` on a server). Run from inside a checkout, about a dozen bind mounts (ClickHouse configs, Kafka topics, livestream and Temporal config, `idl`, `user_scripts`) point at paths that do not exist. The setup below adds a small override file and a few generated files inside the checkout. (Validated with `docker compose config` against PostHog `master` and Docker Compose 5.1.2; the full stack is heavy and was not started when this doc was written, so expect to adjust.)

## Setup

Clone PostHog somewhere outside this repo, then from its root:

### 1. `.env`

Generate the secrets once. Changing `POSTHOG_SECRET` later invalidates sessions and encrypted data.

```sh
cat > .env <<EOF
POSTHOG_SECRET=$(openssl rand -hex 32)
ENCRYPTION_SALT_KEYS=$(openssl rand -hex 16)
BROWSERLESS_SECRET=$(openssl rand -hex 32)
INTERNAL_REQUEST_TOKEN=$(openssl rand -hex 32)
RECORDING_API_JWT_SECRET=$(openssl rand -hex 32)
OBJECT_STORAGE_ACCESS_KEY_ID=$(openssl rand -hex 32)
OBJECT_STORAGE_SECRET_ACCESS_KEY=$(openssl rand -hex 32)
DOMAIN=localhost
TLS_BLOCK=
CADDY_TLS_BLOCK=
CADDY_HOST=http://
EOF
chmod 600 .env
```

`OBJECT_STORAGE_ACCESS_KEY_ID` and `OBJECT_STORAGE_SECRET_ACCESS_KEY` are required or compose refuses to start. `CADDY_HOST=http://` makes Caddy serve plain HTTP on container port 80. Variables such as `SITE_URL` and `IS_BEHIND_PROXY` in `.env` do nothing: the hobby file hardcodes them.

### 2. `compose/` scripts

These are exactly what `bin/deploy-hobby` writes:

```sh
mkdir -p compose
cat > compose/start <<'EOF'
#!/bin/bash
./compose/wait
./bin/migrate
./bin/docker-server
EOF

cat > compose/temporal-django-worker <<'EOF'
#!/bin/bash
./bin/temporal-django-worker
EOF

cat > compose/wait <<'EOF'
#!/usr/bin/env python3

import socket
import time

def loop():
    print("Waiting for ClickHouse and Postgres to be ready")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect(('clickhouse', 9000))
        print("Clickhouse is ready")
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect(('db', 5432))
        print("Postgres is ready")
    except ConnectionRefusedError as e:
        time.sleep(5)
        loop()

loop()
EOF
chmod +x compose/start compose/temporal-django-worker compose/wait
```

### 3. GeoIP database

The download `bin/deploy-hobby` performs (gitignored upstream). Needs `curl` and `brotli`:

```sh
mkdir -p share
curl -L 'https://mmdbcdn.posthog.net/' --http1.1 | brotli --decompress > share/GeoLite2-City.mmdb
echo '{"date": "'"$(date +%Y-%m-%d)"'"}' > share/GeoLite2-City.json
```

### 4. `compose.yml`

Create `compose.yml` in the checkout root. It `include`s the hobby file, publishes Caddy on `8000` (avoiding the LGTM stack's 3000, 3200, 4317, 4318 and 13133), serves `SITE_URL` over plain HTTP, and points the broken volumes at the checkout's real paths. `!override` replaces a list; without it compose would append to the hobby file's `80` and `443` ports and mounts.

```yaml
include:
  - docker-compose.hobby.yml

services:
  proxy:
    ports: !override
      - '8000:80'

  # The hobby file hardcodes SITE_URL=https://$DOMAIN on these five services.
  web:
    environment:
      SITE_URL: http://localhost:8000
  worker:
    environment:
      SITE_URL: http://localhost:8000
  plugins:
    environment:
      SITE_URL: http://localhost:8000
  asyncmigrationscheck:
    environment:
      SITE_URL: http://localhost:8000
  temporal-django-worker:
    environment:
      SITE_URL: http://localhost:8000

  # The hobby file mounts ./posthog/...; here the checkout is the current directory.
  clickhouse:
    volumes: !override
      - ./posthog/idl:/idl
      - ./docker/clickhouse/docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d
      - ./docker/clickhouse/config.xml:/etc/clickhouse-server/config.xml
      - ./docker/clickhouse/config.d/default.xml:/etc/clickhouse-server/config.d/default.xml
      - ./docker/clickhouse/config.d/hobby.xml:/etc/clickhouse-server/config.d/hobby.xml
      - ./docker/clickhouse/users.xml:/etc/clickhouse-server/users.xml
      - ./docker/clickhouse/user_defined_function.xml:/etc/clickhouse-server/user_defined_function.xml
      - ./posthog/user_scripts:/var/lib/clickhouse/user_scripts
      - clickhouse-data:/var/lib/clickhouse
  kafka-init:
    volumes: !override
      - ./docker/kafka/topics.txt:/topics.txt:ro
  livestream:
    volumes: !override
      - ./docker/livestream/configs-hobby.yml:/configs/configs.yml
  temporal:
    volumes: !override
      - ./docker/temporal/dynamicconfig:/etc/temporal/config/dynamicconfig
```

Run `docker compose config` first to confirm every bind mount resolves to a real path in the checkout. The Rust services (`capture`, etc.) declare a `build` context of `./posthog/rust`; if compose tries to build them, run `docker compose pull` first, or override their `build.context` to `./rust`.

## Run

```sh
docker compose up -d
```

Open `http://localhost:8000`, create a project, and copy its **project token** (Project settings). The collector endpoints are `http://localhost:8000/i/v0/e/` (events) and `/i/v1/*` (OTLP).

PostHog publishes 8000 plus 8081, 7233, 8333, 9333 and 19000 (the rest bound to 127.0.0.1), so it does not collide with the LGTM stack.

## Send events from a dev build

`apps/desktop/.env.development` and `apps/vscode/.env.development` set `POSTHOG_HOST=http://localhost:8000`. The project token is **not** committed: put it in a gitignored `.env` next to each (`apps/desktop/.env` and `apps/vscode/.env`). Vite loads `.env` together with `.env.development` and bakes `POSTHOG_PROJECT_TOKEN` into the bundle at build time, for dev builds only (a prod build bakes an empty token). A shell value wins over the file.

```sh
# apps/desktop/.env and apps/vscode/.env
POSTHOG_PROJECT_TOKEN=<project token from PostHog>
```

Restart the dev command after changing it (the token is read when Vite starts):

```sh
pnpm tauri:dev        # desktop
pnpm vscode:dev       # VS Code: keep it running, then in another terminal:
pnpm vscode:open      # open the extension development host
```

Open the app: `app_opened` appears in PostHog under Activity. With the token empty or unset, no requests are made and nothing is logged as an error. Only a dev build ever sends: a prod build never contains the token.

The desktop app also needs `http://localhost:8000` in the `http:default` scope of `apps/desktop/src-tauri/capabilities/default.json` (already added), or Tauri blocks the request silently.
