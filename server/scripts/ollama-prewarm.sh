#!/usr/bin/env bash
# Ollama Prewarm Script
# Keeps the configured model loaded in GPU memory at all times.
# Reads model name from /etc/ollama-prewarm.conf

set -euo pipefail

CONF="/etc/ollama-prewarm.conf"
OLLAMA_URL="http://localhost:11434"

if [[ ! -f "$CONF" ]]; then
  echo "ERROR: Config file $CONF not found"
  exit 1
fi

source "$CONF"

if [[ -z "${MODEL:-}" ]]; then
  echo "ERROR: MODEL not set in $CONF"
  exit 1
fi

# Check if ollama is reachable
if ! curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "Ollama not reachable at $OLLAMA_URL — restarting service"
  systemctl restart ollama
  sleep 5
fi

# Check if model is already loaded via /api/ps
LOADED=$(curl -sf "$OLLAMA_URL/api/ps" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    if m.get('name','').startswith('${MODEL}'):
        print('yes')
        break
else:
    print('no')
" 2>/dev/null || echo "no")

if [[ "$LOADED" == "yes" ]]; then
  echo "Model $MODEL is already loaded in memory"
  exit 0
fi

echo "Prewarming model $MODEL ..."
# Send a minimal generate request with keep_alive=-1 to load and pin the model
curl -sf "$OLLAMA_URL/api/generate" \
  -d "{\"model\": \"$MODEL\", \"prompt\": \"\", \"keep_alive\": -1}" \
  >/dev/null 2>&1

echo "Model $MODEL prewarmed successfully"
