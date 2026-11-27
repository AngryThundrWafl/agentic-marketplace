---
name: Inkling 2 Mini prompting reference
source:
  - https://huggingface.co/thinkingmachines/Inkling-2-Mini
  - https://thinkingmachines.ai/news/inkling-2-mini/
  - https://recipes.vllm.ai/thinkingmachines/Inkling-2-Mini
  - https://huggingface.co/mlx-community/Inkling-2-Mini-oQ4e-mtp
fetched: 2026-11-26
covers: Thinking Machines Lab Inkling 2 Mini (thinkingmachines/Inkling-2-Mini and mlx-community/Inkling-2-Mini-oQ4e-mtp), looped-layer MoE architecture, 1M context, reasoning_effort, generation_config sampling, special tokens, tool calling, oMLX/vLLM serving, and documented agentic limitations
---

# Inkling 2 Mini (`thinkingmachines/Inkling-2-Mini`)

Tags: `[Vendor]` = directly from the Thinking Machines Lab model card, `generation_config.json`, `chat_template.jinja`, vLLM recipe, and `oQ4e-mtp` MLX model card above. `[General]` = cross-source synthesis (must be tested). `unverified` = vendor docs are silent; nothing extrapolated from other models.

## 1. Sampling, Context & Architecture Summary `[Vendor]`

| Variant | `do_sample` / Temp | Other Sampling (`top_p`/`top_k`/`min_p`) | Native Context | Architecture / Params | Reasoning Control |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`thinkingmachines/Inkling-2-Mini`** | `do_sample: true`, `temperature: 1.0` | `unverified` | `1,048,576` (`1M`; `262,144` in vLLM H100/DGX Spark recipes) | 24 physical decoder layers (26.4B total / 3.4B base active, **5.4B effective active** across 3 loop passes), sparse MoE (8/128 experts), Apache 2.0 | `reasoning_effort` (`0.0`–`0.99` or `"none"`..`"max"`; default `0.9`) |
| **`mlx-community/Inkling-2-Mini-oQ4e-mtp`** | Inherits base `generation_config` (`temp: 1.0`) | `unverified` | `1,048,576` (`1M`) | oMLX `>=0.8.1` mixed-precision MLX (`oQ4e`: NVFP4 + affine 4/8-bit + BF16 ViT/DSpark `mtp.safetensors` draft, `~4.915` bpw LM+ViT / `~16.85 GB`) | Same `chat_template.jinja` `reasoning_effort` |

- **Modalities:** Accepts UTF-8 text and pixel images (optimal `40px`–`4096px` per dimension; `user` and `tool` messages only; audio raises a template exception); outputs text only. `[Vendor]`

## 2. Looped-Layer Architecture & Local Quantization `[Vendor]`

- **Looped core (`layers 6–17`):** A 24-layer decoder-only sparse MoE transformer (hidden size `2,304`, 20 sliding-window + 4 full-attention layers, 24 query / 8 KV heads, 4 short convolutions, 128 routed experts / top-8) plus a 23-layer ViT. Prelude (`0–5`) and coda (`18–23`) run once; the middle 12 layers (`6–17`) run **three passes per token** with shared weights (`48` logical layer visits), each pass keeping its own KV and conv-state caches and reading gated rank-64 messages from the previous pass. `[Vendor]`
- **Compute vs. active params:** Each extra pass adds `~1.0B` effective active parameters (`3.4B` base → `5.4B` effective active across 3 passes), so per-token compute is higher than `3.4B` alone suggests. `[Vendor]`
- **Local hardware & `oQ4e-mtp`:** Native checkpoint is `~20 GB` (mixed NVFP4 and MXFP8), targeting `1x` NVIDIA DGX Spark or Apple Silicon / GPUs with `>=32 GB` memory/VRAM. `mlx-community/Inkling-2-Mini-oQ4e-mtp` keeps layers `0–19` experts in NVFP4, requantizes layers `20–23` to affine 4-bit, stores attention/embeddings/vocab head in affine 8-bit, and bundles the BF16 DSpark draft (`mtp.safetensors`) for oMLX Lightning MTP speculative decoding. `[Vendor]`

## 3. Reasoning Effort, Chat Template & Tool Calling `[Vendor]`

- **`reasoning_effort` mapping (`chat_template.jinja`):** Injected before the first non-system message as `<|message_system|><|content_text|>Thinking effort level: <num><|end_message|>`. Defaults to `0.9` (`high`) when omitted/None. Named presets: `"none"` (`0.0`), `"minimal"` (`0.1`), `"low"` (`0.2`), `"medium"` (`0.7`), `"high"` (`0.9`), `"xhigh"` (`0.99`), `"max"` (`0.99`), or any float in `[0.0, 0.99]` (out-of-range floats or unknown strings raise a template exception). `[Vendor]`
- **Reasoning cannot be fully disabled:** Setting `reasoning_effort` to `"none"` (`0.0`) does not fully disable reasoning—the model may still emit a short reasoning block, and its middle layers always execute 3 passes per token. Because looped passes perform internal computation without emitting tokens, chain-of-thought text does not expose all reasoning work. `[Vendor]`
- **Special tokens & turn structure:** Roles use `<|message_system|>`, `<|message_user|>`, `<|message_model|>`, and `<|message_tool|>`, closed by `<|end_message|>`; assistant turns end with `<|content_model_end_sampling|>`. Content blocks use `<|content_text|>`, `<|content_thinking|>` (for prior assistant `reasoning_content`), `<|content_image|><|unused_200054|>`, and `<|content_xml|>` (for `tool_declare`). `[Vendor]`
- **Tool calling & vLLM serving:** Tool schemas serialize as compact sorted JSON inside `<|message_system|>tool_declare<|content_xml|>[...]<|end_message|>`. Model tool calls emit `<|message_model|><fn.name><|content_invoke_tool_json|>{"name":...,"args":{...}}<|end_message|>` (where `args` in history must be a parsed object, not a JSON string). On vLLM (`>=0.35.0` / nightly), serve with `--reasoning-parser inkling --tool-call-parser inkling --enable-auto-tool-choice` and optional DSpark speculator (`--speculative-config '{"method":"dspark","num_speculative_tokens":7,"draft_sample_method":"probabilistic"}'`). `[Vendor]`

## 4. Standardized Prompts, Starter Skeleton & Operational Guardrails `[Vendor]`

- **Starter skeleton** (pair with `temperature: 1.0`, explicit token/turn caps, and sandboxing for tool use): `[General]` `[Vendor]`
  ```text
  [system]
  You are a focused maintenance assistant. {{domain_rules}}
  Before any destructive or irreversible action, ask for confirmation or stop and report.
  Verify every claimed file change or command outcome directly from tool output.
  [user]
  {{task_prompt}}
  ```
- **Documented limitations & mitigations (Model Card §7):** `[Vendor]`
  - **Repetitive reasoning loops:** Can get stuck re-checking its own work without progress (especially when debugging code). **Mitigation:** Set hard `max_tokens` and agent-turn limits in the harness. `[Vendor]`
  - **Agentic reliability & destructive actions:** Less reliable than larger models (e.g., Inkling 2 Small) at following detailed conventions; may delete/overwrite files without confirmation and misreport outcomes. **Mitigation:** Run agentic workloads in a sandbox, require confirmation before destructive/irreversible actions, and verify outcomes from tool outputs rather than prose summaries. `[Vendor]`
  - **Factual recall & non-English quality:** Higher hallucination risk on knowledge-heavy queries and degraded/mixed-language output outside English (observed in Chinese). `[Vendor]`

## 5. Gaps / `unverified` `[Vendor]`

- Recommended `top_p`, `top_k`, `min_p`, `presence_penalty`, `repetition_penalty`, and `max_output_tokens` ceilings are `unverified` in the official model card and `generation_config.json`.
- Few-shot prompting guidance, `system` vs. `user` instruction-hierarchy edge cases, and built-in grammar-constrained JSON enforcement are `unverified` in vendor docs.
