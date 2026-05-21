#!/usr/bin/env bash
# Smoke test for the Task Agent Loop v1.
#
# Usage:
#   AGENTS_BASE=https://aiagent.ringlypro.com/projects \
#   AGENTS_TOKEN=<jwt> \
#   PROJECT_ID=40 \
#   ./scripts/smoke-test-agents.sh
#
# Posts 3 test tasks (one matching each agent's trigger pattern), polls
# /agents/queue every 5s for up to 3 minutes, then prints the agent_output
# excerpts for human review.

set -u
BASE="${AGENTS_BASE:-https://aiagent.ringlypro.com/projects}"
TOKEN="${AGENTS_TOKEN:-}"
PROJECT_ID="${PROJECT_ID:-40}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: AGENTS_TOKEN (JWT) must be set. Login to the projects app and copy the d2ai_token from localStorage." >&2
  exit 1
fi

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "== Health check =="
curl -sS "${AUTH[@]}" "$BASE/api/v1/agents/health" | python3 -m json.tool || echo "(health endpoint unreachable)"
echo ""

create_task() {
  local title="$1"
  local desc="$2"
  echo "-> Creating: $title"
  curl -sS "${AUTH[@]}" -X POST "$BASE/api/v1/tasks" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'title': sys.argv[1], 'description': sys.argv[2], 'project_id': int(sys.argv[3]), 'task_type': 'task', 'priority': 'medium'}))" "$title" "$desc" "$PROJECT_ID")" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('  task id:', d.get('data',{}).get('id'))"
}

create_task "Research the AcuityMD competitive landscape" "Quick competitive analysis for SurgicalMind sales ops. Pricing, target buyers, weaknesses."
sleep 1
create_task "Send proposal to Eduardo about PLANEA wedge" "Draft outreach proposing we start with the simulation module before expanding to advisory."
sleep 1
create_task "Investigate biodiesel feedstock supply chain in Florida" "Used cooking oil collection volumes, top distributors, regulatory landscape."

echo ""
echo "== Polling queue every 5s (up to 3 min) =="
for i in $(seq 1 36); do
  Q=$(curl -sS "${AUTH[@]}" "$BASE/api/v1/agents/queue")
  PENDING=$(echo "$Q" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len([t for t in d.get('data',[]) if t.get('agent_status') in ('pending','processing')]))" 2>/dev/null || echo "?")
  echo "[$i] queue depth (pending+processing): $PENDING"
  if [ "$PENDING" = "0" ]; then break; fi
  sleep 5
done

echo ""
echo "== Final results =="
curl -sS "${AUTH[@]}" "$BASE/api/v1/tasks" \
  | python3 -c "
import json, sys, re
d = json.load(sys.stdin)
tasks = [t for t in d.get('data', []) if t.get('agent_status')]
tasks.sort(key=lambda t: t.get('updated_at',''), reverse=True)
for t in tasks[:8]:
    out = (t.get('agent_output') or '')[:300].replace('\n',' ')
    print(f\"id={t['id']} type={t.get('agent_type')} status={t.get('agent_status')} model={t.get('agent_model')} cost=\${t.get('agent_cost_usd') or 0}\")
    print(f'   excerpt: {out}')
    err = t.get('agent_error')
    if err: print(f'   ERROR: {err[:200]}')
    print()
"
