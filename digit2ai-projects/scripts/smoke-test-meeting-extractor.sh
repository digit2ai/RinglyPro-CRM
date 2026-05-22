#!/usr/bin/env bash
# Smoke test for Option A — Meeting-Minutes Extractor with Agent Routing.
#
# Usage:
#   AGENTS_BASE=https://aiagent.ringlypro.com/projects \
#   AGENTS_TOKEN=<jwt> \
#   PROJECT_ID=40 \
#   ./scripts/smoke-test-meeting-extractor.sh
#
# Creates a meeting minute with action items that obviously hit each
# agent_type bucket (research, draft, none), polls the meeting until
# ai_processed_at is set, then prints the tasks the extractor created
# along with their agent routing + agent_status. Asserts that at least
# one task lands in 'ready_for_review' within 90s.

set -u
BASE="${AGENTS_BASE:-https://aiagent.ringlypro.com/projects}"
TOKEN="${AGENTS_TOKEN:-}"
PROJECT_ID="${PROJECT_ID:-40}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: AGENTS_TOKEN (JWT) must be set." >&2
  echo "Login at https://aiagent.ringlypro.com/projects/ and copy d2ai_token from localStorage." >&2
  exit 1
fi

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
STAMP=$(date +%s)
SUBJECT="SMOKE-EXTRACTOR-${STAMP} PLANEA strategy review"

NOTES=$(cat <<EOF
This is a smoke-test paste-in for the meeting-minutes extractor with agent routing.

DISCUSSION:
- Eduardo asked us to research the AcuityMD competitive landscape so we know how
  their pricing stacks up against what we plan to charge for SurgicalMind.
- Action: Manuel will send a proposal to Eduardo about the PLANEA simulation-only
  wedge (we agreed not to scope all 5 pillars at once).
- Action: Eduardo will share the MVP access credentials with the technical advisor
  so they can review the current build hosted in Render.
- We need a quick benchmark of biodiesel feedstock supply chain dynamics in Florida
  before the Aceites pivot meeting next week.
- Action: Schedule a kickoff meeting with the Reddi team for next Monday at 10am ET.

SMOKE-EXTRACTOR-${STAMP}
EOF
)

echo "== Creating test meeting minute =="
CREATE_BODY=$(python3 -c "
import json, sys
print(json.dumps({
  'subject': sys.argv[1],
  'notes': sys.argv[2],
  'project_id': int(sys.argv[3]),
  'auto_send': False
}))
" "$SUBJECT" "$NOTES" "$PROJECT_ID")

CREATE_RESP=$(curl -sS "${AUTH[@]}" -X POST "$BASE/api/v1/meeting-minutes" -d "$CREATE_BODY")
MINUTE_ID=$(echo "$CREATE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -z "$MINUTE_ID" ]; then
  echo "ERROR: failed to create meeting minute" >&2
  echo "$CREATE_RESP" >&2
  exit 1
fi
echo "  minute id: $MINUTE_ID"

echo ""
echo "== Polling meeting (waiting for ai_processed_at, max 60s) =="
PROCESSED=""
for i in $(seq 1 12); do
  R=$(curl -sS "${AUTH[@]}" "$BASE/api/v1/meeting-minutes/$MINUTE_ID")
  PROC=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('ai_processed_at') or '')" 2>/dev/null)
  TC=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('auto_tasks_created') or 0)" 2>/dev/null)
  echo "[$i] ai_processed_at=$PROC tasks_created=$TC"
  if [ -n "$PROC" ] && [ "$PROC" != "None" ]; then
    PROCESSED=1
    break
  fi
  sleep 5
done
if [ -z "$PROCESSED" ]; then
  echo "ERROR: meeting was not processed within 60s" >&2
  exit 1
fi

echo ""
echo "== Polling tasks (waiting for agent dispatch, max 90s) =="
sleep 5
for i in $(seq 1 18); do
  ALL=$(curl -sS "${AUTH[@]}" "$BASE/api/v1/tasks")
  COUNT_READY=$(echo "$ALL" | python3 -c "
import json, sys
d = json.load(sys.stdin).get('data', [])
ms = 'minutes #${MINUTE_ID}'
mine = [t for t in d if t.get('description') and ms in t['description']]
ready = [t for t in mine if t.get('agent_status') == 'ready_for_review']
print(len(ready), len(mine))
" 2>/dev/null)
  echo "[$i] ready/created: $COUNT_READY"
  READY_N=$(echo "$COUNT_READY" | awk '{print $1}')
  if [ "$READY_N" -ge 1 ] 2>/dev/null; then
    break
  fi
  sleep 5
done

echo ""
echo "== Final report =="
curl -sS "${AUTH[@]}" "$BASE/api/v1/tasks" | python3 -c "
import json, sys
d = json.load(sys.stdin).get('data', [])
ms = 'minutes #${MINUTE_ID}'
mine = [t for t in d if t.get('description') and ms in t['description']]
mine.sort(key=lambda t: t.get('id', 0))
print(f'Tasks created from minute #${MINUTE_ID}: {len(mine)}')
print()
print(f\"{'id':<6} {'agent_type':<10} {'agent_status':<20} {'title':<60}\")
print('-' * 100)
for t in mine:
    at = (t.get('agent_type') or '-')[:10]
    st = (t.get('agent_status') or '-')[:20]
    ti = (t.get('title') or '')[:60]
    print(f'{t[\"id\"]:<6} {at:<10} {st:<20} {ti:<60}')
print()
for t in mine:
    if t.get('agent_status') == 'ready_for_review':
        out = (t.get('agent_output') or '')[:400].replace('\n',' ')
        print(f'--- task {t[\"id\"]} ({t.get(\"agent_type\")}) output excerpt ---')
        print(out)
        print()
"
echo ""
echo "== Done =="
echo "Meeting id $MINUTE_ID — visit https://aiagent.ringlypro.com/projects/ Meeting Minutes to review."
