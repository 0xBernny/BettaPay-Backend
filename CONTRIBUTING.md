# Contributing

## Local development with Docker Compose

Prerequisites:
- Docker Desktop or Docker Engine
- Docker Compose v2

Start the full stack:
```bash
docker compose up --build
```

Stop the stack:
```bash
docker compose down
```

Rebuild containers after changing dependencies or Docker configuration:
```bash
docker compose up --build
```

Data volumes are persisted in Docker named volumes for PostgreSQL and Redis. To reset them:
```bash
docker compose down -v
```

Common workflow:
1. Start the stack with `docker compose up --build`
2. Open the services at `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3002`, and `http://localhost:3003`
3. Edit source files locally; the containers will reload the workspace through the mounted volume
