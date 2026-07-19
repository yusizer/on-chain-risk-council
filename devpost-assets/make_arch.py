import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

fig, ax = plt.subplots(figsize=(14, 9))
ax.set_xlim(0, 14)
ax.set_ylim(0, 9)
ax.axis("off")
fig.patch.set_facecolor("#0f172a")
ax.set_facecolor("#0f172a")

C_BOX = "#1e293b"
C_EDGE = "#38bdf8"
C_TXT = "#e2e8f0"
C_ACC = "#34d399"
C_WARN = "#fbbf24"

def box(x, y, w, h, text, fc=C_BOX, ec=C_EDGE, tc=C_TXT, fs=11, weight="bold"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1,rounding_size=0.15",
                                fc=fc, ec=ec, lw=2))
    ax.text(x + w/2, y + h/2, text, ha="center", va="center", color=tc,
            fontsize=fs, weight=weight, wrap=True)

def arrow(x1, y1, x2, y2, color=C_EDGE, style="-|>"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                 mutation_scale=18, color=color, lw=1.8))

# Title
ax.text(7, 8.6, "On-Chain Risk Council — Architecture", ha="center", va="center",
        color="#f8fafc", fontsize=20, weight="bold")
ax.text(7, 8.15, "Multi-agent Qwen society + deterministic guardrail · Solana · Alibaba Cloud",
        ha="center", va="center", color="#94a3b8", fontsize=12)

# Client
box(0.3, 6.4, 2.2, 1.1, "Client /\nWallet / Agent", fc="#312e81", ec="#818cf8")
# API
box(3.0, 6.4, 2.2, 1.1, "Next.js API\n(POST /api/actions)\nSSE stream", fc=C_BOX, ec=C_EDGE)
# Orchestrator
box(5.7, 6.4, 2.3, 1.1, "Council\nOrchestrator\ndebate + SSE", fc=C_BOX, ec=C_EDGE)
# Deterministic extractor
box(3.0, 4.5, 2.2, 1.1, "Deterministic\nextractor\n(intent + tx decode)", fc="#064e3b", ec=C_ACC)

# Qwen cloud cluster
ax.add_patch(FancyBboxPatch((8.6, 5.3), 4.6, 3.0, boxstyle="round,pad=0.15,rounding_size=0.2",
                            fc="#0c1a2e", ec="#a78bfa", lw=2))
ax.text(10.9, 7.95, "Qwen Cloud (DashScope)", ha="center", color="#c4b5fd", fontsize=12, weight="bold")
box(8.9, 6.7, 4.0, 0.7, "qwen3.7-max · reasoning / referee", fc="#1e1b4b", ec="#a78bfa", fs=10)
box(8.9, 5.8, 4.0, 0.7, "qwen3-coder-plus · exploit analysis", fc="#1e1b4b", ec="#a78bfa", fs=10)
box(8.9, 4.9, 4.0, 0.7, "qwen-turbo · routing · text-embedding-v3", fc="#1e1b4b", ec="#a78bfa", fs=10)

# Helius
ax.add_patch(FancyBboxPatch((3.0, 2.4), 4.0, 1.4, boxstyle="round,pad=0.15,rounding_size=0.2",
                            fc="#0c1a2e", ec="#22d3ee", lw=2))
ax.text(5.0, 3.65, "Helius MCP (stdio)", ha="center", color="#67e8f9", fontsize=11, weight="bold")
ax.text(5.0, 3.05, "parseTransactions · getAccountInfo ·\ngetTokenAccounts · wallet funding",
        ha="center", color="#cffafe", fontsize=9)

# DB
box(8.6, 2.4, 4.6, 1.4, "Alibaba ECS · PostgreSQL + pgvector\n(exploit_patterns + audit/decisions log)",
    fc="#3b2f0b", ec=C_WARN, fs=10)

# Guardrail
box(5.7, 0.5, 2.3, 1.0, "Guardrail\n(one-way ratchet)", fc="#7f1d1d", ec="#f87171", fs=11)

# Arrows
arrow(2.5, 6.95, 3.0, 6.95)
arrow(5.2, 6.95, 5.7, 6.95)
arrow(3.0, 6.4, 3.0, 5.6)
arrow(7.9, 6.95, 8.6, 7.0)
arrow(5.7, 6.4, 5.0, 4.0, color="#22d3ee")
arrow(5.0, 3.8, 5.0, 3.4, color="#22d3ee")
arrow(8.6, 3.1, 8.6, 2.4, color=C_WARN)
arrow(7.0, 6.4, 8.9, 4.9, color="#a78bfa")
arrow(7.0, 5.0, 7.0, 2.4, color=C_WARN)
arrow(6.95, 0.95, 6.95, 1.5, color="#f87171")

plt.tight_layout()
plt.savefig("/tmp/opencode/architecture_clean.png", dpi=150, facecolor="#0f172a", bbox_inches="tight")
print("saved")
