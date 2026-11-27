---
name: skill-creator
description: Creates, refactors, and audits portable Agent Skills (SKILL.md, frontmatter, references, scripts) against the agentskills.io spec and Anthropic authoring best practices. Use when writing a new skill, restructuring an existing one, reviewing a skill or plugin for compliance, or fixing skill triggering.
metadata:
  version: "1.5.0"
---

# Skill Creator

Author, refactor, and audit portable Agent Skills (`skills/<skill-name>/SKILL.md`) conforming to the `agentskills.io` specification, Agent Plugins v1.0.0 packaging rules, and the shared Prompting Reference Pack.

## On-Demand Loading (One-Level-Deep)

Load only the resources needed for the active task so startup and runtime context stay lean:

- **Creating or refactoring a skill:** Read [references/authoring-guide.md](references/authoring-guide.md) for the 8-step authoring procedure.
- **Auditing or verifying a skill:** Read [references/checklist.md](references/checklist.md) for the pass/fail verification rubric.
- **Writing model- or task-specific prompting instructions:** Read **only** the matching leaf file(s) below directly from `SKILL.md`. Load model-specific files (`11`–`22`) before general files (`01`, `03`–`09`), since model-specific behavior overrides general defaults.

| Target / Topic | Leaf Reference File |
| --- | --- |
| Claude Fable 5.2 / Mythos 5.2 overrides | [references/pack/11-fable-5-2.md](references/pack/11-fable-5-2.md) |
| Claude Opus 5.5 overrides | [references/pack/12-opus-5-5.md](references/pack/12-opus-5-5.md) |
| Claude Sonnet 5.5 overrides | [references/pack/13-sonnet-5-5.md](references/pack/13-sonnet-5-5.md) |
| Claude Haiku 5.5 overrides | [references/pack/14-haiku-5-5.md](references/pack/14-haiku-5-5.md) |
| Legacy Claude (Fable 5.1/5, Opus 5/4.8, Sonnet 5) | [references/pack/15-legacy-models.md](references/pack/15-legacy-models.md) |
| DeepSeek-R1 & DeepSeek-R1-0528 | [references/pack/16-deepseek-r1.md](references/pack/16-deepseek-r1.md) |
| Qwen3 (`235B-A22B`, `32B`, `2507` variants) | [references/pack/17-qwen3.md](references/pack/17-qwen3.md) |
| OpenAI `gpt-oss` (`120b`, `20b`) & Harmony | [references/pack/18-gpt-oss.md](references/pack/18-gpt-oss.md) |
| Meta Llama 3.3 & Llama 4 (`Scout`, `Maverick`) | [references/pack/19-llama.md](references/pack/19-llama.md) |
| Google Gemini 4 (`Carbon`, `Neon`, `Hydrogen`, `Argon`) | [references/pack/20-gemini-4.md](references/pack/20-gemini-4.md) |
| Google Gemini 3.8 Flash (`gemini-3.8-flash`) | [references/pack/21-gemini-3-8-flash.md](references/pack/21-gemini-3-8-flash.md) |
| Thinking Machines Inkling 2 Mini (`Inkling-2-Mini`, `oQ4e-mtp`) | [references/pack/22-inkling.md](references/pack/22-inkling.md) |
| Claude core principles (clarity, XML, few-shot, long context) | [references/pack/01-claude-core.md](references/pack/01-claude-core.md) |
| Cross-family overlap & porting rules | [references/pack/03-overlap-and-porting.md](references/pack/03-overlap-and-porting.md) |
| Condensed Claude prompt skeletons | [references/pack/04-templates.md](references/pack/04-templates.md) |
| Output formatting, prefill migration, JSON structured outputs | [references/pack/05-output-and-formatting.md](references/pack/05-output-and-formatting.md) |
| Adaptive thinking, `output_config.effort`, caching | [references/pack/06-thinking-and-effort.md](references/pack/06-thinking-and-effort.md) |
| Tool steering, parallelism, subagents, coding guardrails | [references/pack/07-tools-and-agents.md](references/pack/07-tools-and-agents.md) |
| Hallucination reduction, consistency, injection & leak defenses | [references/pack/08-guardrails.md](references/pack/08-guardrails.md) |
| Success criteria, evals, automated grading, latency tuning | [references/pack/09-evals-and-latency.md](references/pack/09-evals-and-latency.md) |
| Side-by-side cross-model delta matrix | [references/pack/10-model-delta-matrix.md](references/pack/10-model-delta-matrix.md) |
| Source provenance & fetch dates | [references/pack/sources.md](references/pack/sources.md) |

## Workflow Summary

1. **Clarify scope & triggers:** Define success criteria, target harnesses/models, and trigger/non-trigger boundaries.
2. **Ground in leaf references:** Load only the matching reference file(s) from the table above before drafting instructions.
3. **Structure progressive disclosure:** Keep `SKILL.md` thin and route directly (one level deep) to self-contained leaf files under `references/`, `scripts/`, `assets/`, or shared plugin references.
4. **Author valid frontmatter:** Use only allowed `agentskills.io` keys, match `name` to the parent directory, and write a clean single-line, third-person `description` with triggers.
5. **Write clear, positive guides:** Explain rationale ("why"), use neutral tool triggers, tag claims `[Claude docs]`, `[Vendor]`, `[General]`, or `unverified`, and link rather than duplicate model rules.
6. **Validate & iterate:** Verify every gate in [references/checklist.md](references/checklist.md), run repository/CLI validators, and refine one variable per iteration against evals.

## Audit Mode

When asked to audit or review existing skills, report before editing so the user stays in control of changes:

1. Grade every gate in [references/checklist.md](references/checklist.md) per skill as **PASS**, **FAIL**, or **N/A**, citing `path:line` for each failure.
2. Propose prioritized fixes grouped by file, noting any required version bump.
3. Apply fixes only after the user approves them, then re-run the validators.
