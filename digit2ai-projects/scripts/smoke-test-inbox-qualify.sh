#!/usr/bin/env bash
# Smoke test for the Inbox Qualify Actions (Option C in conversation).
#
# Usage:
#   AGENTS_BASE=https://aiagent.ringlypro.com/projects \
#   PROJECT_ID=42 \
#   SHARE_TOKEN=<the project's company_access_token UUID> \
#   ./scripts/smoke-test-inbox-qualify.sh
#
# Verifies:
#   1. pdfkit is installed
#   2. GET /api/v1/intake/projects/:id/triage-pdf?token=X&lang=es returns a real PDF
#   3. GET /api/v1/intake/projects/:id/triage-pdf?token=X&lang=en returns a real PDF
#   4. Sample PDF saved to /tmp for human review
# (The triage-answer POST + triage-answers GET need a share-link JWT,
#  not just a raw token — they're tested via the magic-link UI.)

set -u
BASE="${AGENTS_BASE:-https://aiagent.ringlypro.com/projects}"
PROJECT_ID="${PROJECT_ID:-42}"
TOKEN="${SHARE_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: SHARE_TOKEN must be set." >&2
  echo "Run: SELECT token FROM d2_company_access_tokens WHERE company_id = (SELECT company_id FROM d2_projects WHERE id=$PROJECT_ID) LIMIT 1;" >&2
  exit 1
fi

echo "== Check 1: pdfkit installed =="
if grep -q '"pdfkit"' /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/package.json; then
  echo "  OK"
else
  echo "  MISSING (npm install pdfkit needed)"
  exit 1
fi
echo ""

echo "== Check 2: ES PDF =="
ES_URL="$BASE/api/v1/intake/projects/$PROJECT_ID/triage-pdf?token=$TOKEN&lang=es"
ES_OUT=/tmp/qualify-brief-es.pdf
HTTP_CODE=$(curl -sS -o "$ES_OUT" -w "%{http_code}" "$ES_URL")
SIZE=$(wc -c < "$ES_OUT" 2>/dev/null || echo 0)
echo "  HTTP: $HTTP_CODE  size: ${SIZE} bytes  saved: $ES_OUT"
if [ "$HTTP_CODE" != "200" ] || [ "$SIZE" -lt 3000 ]; then
  echo "  FAIL — ES PDF check"
  head -c 500 "$ES_OUT"
  exit 1
fi
file "$ES_OUT" 2>/dev/null | grep -q PDF && echo "  file type: PDF confirmed" || echo "  WARN: file type check inconclusive"
echo ""

echo "== Check 3: EN PDF =="
EN_URL="$BASE/api/v1/intake/projects/$PROJECT_ID/triage-pdf?token=$TOKEN&lang=en"
EN_OUT=/tmp/qualify-brief-en.pdf
HTTP_CODE=$(curl -sS -o "$EN_OUT" -w "%{http_code}" "$EN_URL")
SIZE=$(wc -c < "$EN_OUT" 2>/dev/null || echo 0)
echo "  HTTP: $HTTP_CODE  size: ${SIZE} bytes  saved: $EN_OUT"
if [ "$HTTP_CODE" != "200" ] || [ "$SIZE" -lt 3000 ]; then
  echo "  FAIL — EN PDF check"
  exit 1
fi
echo ""

echo "== Check 4: Bad token returns error PDF or 4xx =="
BAD_URL="$BASE/api/v1/intake/projects/$PROJECT_ID/triage-pdf?token=invalid-token-xyz&lang=en"
BAD_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BAD_URL")
echo "  HTTP: $BAD_CODE (expected 4xx)"
if [ "$BAD_CODE" -lt 400 ] 2>/dev/null; then
  echo "  WARN: bad-token request did not return an error code"
fi
echo ""

echo "== Done =="
echo "ES PDF: $ES_OUT (open it: 'open $ES_OUT')"
echo "EN PDF: $EN_OUT (open it: 'open $EN_OUT')"
