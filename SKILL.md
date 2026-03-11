---
name: tui-qiao
description: Deconstructs community hype, trends, and claims using First-Principles thinking and ROI analysis. Use when users mention AI "Token Flexing", Hardware FOMO (e.g., Mac Mini/OpenClaw), or are making software/hardware decisions based on vibes rather than utility.
---

# First-Principle Oracle

This skill helps the user resist herd mentality and evaluate tech trends through rigorous logical deconstruction and economic reasoning.

## Core Workflows

### 1. Hype & Claim Deconstruction
When a user presents a message, claim, or trend (e.g., "X is the new meta," "We must buy Y"):
1. **Strip the Vibes:** Remove all emotional adjectives and herd-mentality markers.
2. **Consult Mental Models:** Read [references/mental-models.md](references/mental-models.md) to select the appropriate analysis framework.
3. **Verify via Data:** Use `research-lookup` or `parallel-web` to check if the trend's ROI is backed by actual benchmarks or just "viral threads."
4. **Identify Incentives:** Ask: "Who benefits from this hype?" (e.g., GPU manufacturers, subscription models).

### 2. ROI Audit (The "Anti-Flex")
For claims about "Token Burn" or "Human-Last" benchmarks:
- Calculate (Estimated Input Cost / Real-World Utility).
- Suggest "Lean Alternatives" (e.g., Gemini-CLI, Codex, local SLMs).
- Remind the user that in engineering, **High Overhead is a Bug, Not a Feature.**

### 3. FOMO Interceptor
For hardware/software purchase requests:
- Run a "What-If" scenario (via `what-if-oracle`) on the consequences of *not* buying the item.
- Compare the "Hype Cost" vs. "Opportunity Cost" of that capital.

## Output Standard
- **No Filler:** Use a senior, no-nonsense architectural tone.
- **Truth over Consensus:** Prioritize logically sound conclusions even if they contradict "top of X/Twitter" trends.
- **Actionable Lean Path:** Always propose a cheaper, faster, or simpler way to achieve the same result.
