# Alibaba Cloud deploy — On-Chain Risk Council

Deploy checklist for the hackathon proof-of-deployment. The backend runs on an
Alibaba Cloud ECS instance (Docker) and talks to a managed Alibaba RDS
PostgreSQL + pgvector. `alibaba/proof.ts` records the proof.

## 1. RDS PostgreSQL + pgvector
1. Console → ApsaraDB RDS → create **PostgreSQL** (the free-trial spec is fine
   for the hackathon). Region: match the ECS (e.g. `ap-southeast-1`).
2. **Whitelist** the ECS instance's private IP in the RDS whitelist (or use the
   VPC peering / same-VPC setup).
3. Create a database `riskcouncil` and an app user.
4. Connect (`psql` or DMS) and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   (The app also runs this idempotently in `ensureSchema()`, but enable it once
   here to confirm the RDS image supports pgvector.)
5. Set `DATABASE_URL=postgresql://USER:PASS@pgm-XXXX.pg.rds.aliyuncs.com:5432/riskcouncil`
   and `PGSSLMODE=require` in `.env`.

## 2. ECS instance
1. Console → ECS → create an instance (the free-trial `ecs.t6-c1m1`-class spec
   is enough). Same region + VPC as the RDS. Image: `Ubuntu 22.04` / `Alibaba Cloud Linux 3`.
2. Security group: open **22 (SSH)** and **3000 (HTTP)** to your IP (or `0.0.0.0/0`
   for the demo, then tighten).
3. SSH in, install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER  # re-login after
   ```

## 3. Build + run
```bash
git clone <repo> && cd qwen-risk-council
cp .env.example .env
# fill DASHSCOPE_API_KEY, HELIUS_API_KEY, DATABASE_URL (from step 1),
# ALIYUN_ECS_INSTANCE_ID, ALIYUN_RDS_INSTANCE_ID, ALIYUN_REGION
docker compose up -d --build
docker compose logs -f council          # wait for "Ready"
curl http://localhost:3000/api/health   # { ok: true, qwen, helius, db }
```

## 4. Seed the exploit memory (one-time)
```bash
docker compose exec council node --env-file=.env --import tsx scripts/smoke.ts
# (smoke ensures schema + seeds exploit patterns when DATABASE_URL is set)
```

## 5. Record the Alibaba proof
```bash
docker compose exec council node --env-file=.env --import tsx alibaba/proof.ts
# → alibaba/proof.json (ecs metadata + rds + pgvector + qwen + helius + council health)
```
Screen-record: run the command, open `proof.json`, then open the public URL
`http://<ecs-public-ip>:3000/` and submit a drainer intent (live SSE
deliberation → reject). Attach the recording + `proof.json` to the submission.

## 6. Public access
- Council chamber: `http://<ecs-public-ip>:3000/`
- Benchmark dashboard: `http://<ecs-public-ip>:3000/benchmark`
- Health: `http://<ecs-public-ip>:3000/api/health`

## Notes
- `helius-mcp` is pre-installed globally in the Docker image so `npx
  helius-mcp@latest` resolves offline.
- The council is **read-only on mainnet** — it never submits transactions; it
  only approves / escalates / rejects. Simulation runs on a Helius fork.
- `alibaba/proof.ts` reads ECS instance metadata from `100.100.100.200`, which
  is only reachable from inside an Alibaba ECS VM — that's what makes it proof.
