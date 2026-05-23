# infra/docker

Local dev stack + Dockerfile production

## ไฟล์ที่จะมีใน Phase 1
- `docker-compose.dev.yml` — postgres + redis + meilisearch + minio
- `Dockerfile.web` — multi-stage build ของ Next.js
- `Dockerfile.api` — multi-stage build ของ NestJS
