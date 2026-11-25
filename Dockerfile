FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm@12.23.0
RUN corepack enable

# Pinned CLI versions matching capabilities/ and npm registry
RUN npm install -g \
    @github/copilot@1.0.114 \
    @anthropic-ai/claude-code@2.1.332 \
    @openai/codex@0.172.0 \
    opencode-ai@1.19.6 \
    @earendil-works/pi-coding-agent@1.6.0

WORKDIR /workspace
COPY dist /workspace/dist
COPY tests/sandbox/verify-clis.sh /workspace/tests/sandbox/verify-clis.sh

USER node
CMD ["bash", "/workspace/tests/sandbox/verify-clis.sh"]
