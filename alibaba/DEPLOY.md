# Alibaba Cloud deploy — On-Chain Risk Council

Deploy checklist for the hackathon proof-of-deployment on the **ECS free trial**.
This setup uses one Alibaba ECS instance only: Docker runs the Next.js backend
and an internal PostgreSQL + pgvector container. No paid RDS is required.

## Cost guardrails

- Use only the free-trial ECS instance.
- Keep the selected ECS + system disk under the **USD 0.25/hr** trial cap.
- Do not create RDS, SLB, snapshots, backup plans, bandwidth packages, or other
  paid services for this proof.
- Open only ports **22** and **3000**.
- After Devpost proof/demo, stop or release the ECS instance.

## 1. ECS instance

Use the free-trial instance:

- Region: Singapore (`ap-southeast-1`)
- Instance: `ecs.e-c1m2.large` or similar free-trial instance
- OS: Ubuntu 22.04 LTS
- Disk: ESSD Entry, trial-covered
- Public IP: enabled
- Security group: allow TCP `22` and TCP `3000`

## 2. Install Docker on ECS

SSH into ECS and run:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

## 3. Clone and configure

```bash
git clone https://github.com/yusizer/on-chain-risk-council.git
cd on-chain-risk-council
cp .env.example .env
```

Edit `.env`:

```env
DASHSCOPE_API_KEY=...
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
HELIUS_API_KEY=...
SOLANA_NETWORK=mainnet

POSTGRES_PASSWORD=<strong-random-password>
PGSSLMODE=disable

ALIYUN_REGION=ap-southeast-1
ALIYUN_ECS_INSTANCE_ID=i-t4ngod7z5hh5qmeb6w0o
ALIYUN_RDS_INSTANCE_ID=

NODE_ENV=production
PORT=3000
QWEN_TIMEOUT_MS=60000
COUNCIL_MAX_ACTIVE=3
COUNCIL_MAX_PER_WINDOW=20
COUNCIL_WINDOW_MS=600000
# Optional: leave empty for the public browser demo unless you pass the token
# from clients. If set, POST /api/actions and /api/stream require Bearer or
# x-council-token authentication.
COUNCIL_API_TOKEN=
```

`docker-compose.yml` injects the runtime `DATABASE_URL` as:

```text
postgresql://riskcouncil:${POSTGRES_PASSWORD}@db:5432/riskcouncil
```

## 4. Build and run

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f council
```

Health checks:

```bash
curl http://localhost:3000/api/health
curl http://<ecs-public-ip>:3000/api/health
curl 'http://localhost:3000/api/health?deep=1&schema=1'
curl 'http://<ecs-public-ip>:3000/api/health?deep=1&schema=1'
```

Expected shallow liveness: `{ ok: true, mode: "shallow", gate: { ... } }`.
Expected deep/schema check: `{ ok: true, mode: "deep+schema", qwen: { ok: true }, helius: { ok: true }, db: { ok: true } }`.

## 5. Seed memory and record proof

Seed pgvector memory once:

```bash
docker compose exec council npm run smoke
```

Record Alibaba proof from inside ECS:

```bash
docker compose exec council npm run proof
docker compose exec council cat alibaba/proof.json
```

Screen-record:

- terminal running `npm run proof`
- `proof.json` showing `ecs.onEcs: true`, Qwen ok, Helius ok, DB/pgvector ok
- browser at `http://<ecs-public-ip>:3000/`
- live council deliberation rejecting the default drainer intent
- benchmark dashboard at `http://<ecs-public-ip>:3000/benchmark`

## 6. Public URLs

- Council chamber: `http://<ecs-public-ip>:3000/`
- Benchmark dashboard: `http://<ecs-public-ip>:3000/benchmark`
- Health liveness: `http://<ecs-public-ip>:3000/api/health`
- Health deep/schema proof: `http://<ecs-public-ip>:3000/api/health?deep=1&schema=1`

## Notes

- The app is read-only on Solana mainnet. It never submits transactions.
- The pgvector database runs inside ECS only, covered by the ECS free trial.
- `/api/health` is intentionally shallow. Use `/api/health?deep=1&schema=1` for
  Alibaba proof/dependency checks because it pings Qwen, Helius, and DB and can
  create the schema.
- `alibaba/proof.ts` reads ECS metadata from `100.100.100.200`, which is only
  reachable from inside Alibaba ECS.
