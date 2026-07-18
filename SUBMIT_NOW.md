# SUBMIT NOW — Yusif checklist (only you can do these)

Deadline: **Jul 20, 2026 @ 2:00pm PDT**  
Hackathon: https://qwencloud-hackathon.devpost.com/

## 1. YouTube (15 min)
1. Upload `demo-videos/demo-voiced.mp4` as **Public**
2. Title: `On-Chain Risk Council — Qwen Cloud Hackathon Track 3`
3. Copy URL → replace `TODO_YOUTUBE_URL_AFTER_UPLOAD` in `SUBMISSION.md` and README Links

## 2. Devpost form (20 min)
1. Join: https://qwencloud-hackathon.devpost.com/register
2. Submit project:
   - **Title / description:** paste from `SUBMISSION.md`
   - **Track:** Track 3: Agent Society
   - **Repo:** https://github.com/yusizer/on-chain-risk-council
   - **Video:** YouTube URL
   - **Alibaba proof:** link to  
     `https://github.com/yusizer/on-chain-risk-council/blob/main/alibaba/proof.ts`  
     and/or `lib/qwen.ts` (DashScope)
   - **Architecture:** link `ARCHITECTURE.md` or `docs/architecture.png`
   - **Live demo:** http://43.106.15.232:3000
   - **Built with:** Qwen Cloud, Helius MCP, Alibaba ECS, Next.js, TypeScript, MCP SDK

## 3. Blog prize (+$500) (30 min)
1. Publish `BLOG.md` on dev.to (or Medium/X long post)
2. Tag: qwen, alibaba, solana, agents
3. Paste URL into Devpost optional blog field

## 4. GitHub polish (5 min)
```bash
cd /home/yus23/projects/githubbounty/01-solana-agents-skills
# after commit of latest changes:
git subtree split --prefix=qwen-risk-council -b council-subtree
git push qwen council-subtree:main
```
On GitHub repo Settings → About:
- Website: `http://43.106.15.232:3000`
- Topics: `qwen`, `solana`, `multi-agent`, `mcp`, `helius`, `hackathon`

## 5. Judge walkthrough (you should click once before submit)
1. http://43.106.15.232:3000 → Drainer reject → REJECT
2. Clean low-risk → APPROVE/ESCALATE
3. /benchmark → table shows 0% vs 20% falseApprove
4. /api/audit → verification.ok true after a few runs
5. /api/health?deep=1 → qwen/helius/db ok

## Done when
- [ ] YouTube public
- [ ] Devpost **submitted** (not draft)
- [ ] Blog optional published
- [ ] Latest code on `qwen/main`
