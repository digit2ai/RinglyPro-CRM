#!/bin/bash
# Regression check — hits health endpoints on all RinglyPro verticals.
# Used after every Torna Idioma v2 deploy to verify no other vertical broke.
#
# Usage:
#   bash scripts/regression-check.sh                      # production
#   BASE_URL=http://localhost:10000 bash scripts/regression-check.sh  # local
#
# Exits non-zero if any endpoint fails.

set -e

BASE_URL="${BASE_URL:-https://aiagent.ringlypro.com}"

# Endpoints to check: path + human-readable label + expected success substring
ENDPOINTS=(
  "/cw_carriers/health|cw_carriers|healthy"
  "/msk/api/v1/health|msk_intelligence|healthy"
  "/logistics/health|logistics|healthy"
  "/kanchoai/health|kanchoai|healthy"
  "/tunjoracing/health|tunjoracing|healthy"
  "/Torna_Idioma/health|Torna_Idioma v1|healthy"
  "/Torna_Idioma/api/v2/health|Torna_Idioma v2|healthy"
)

echo ""
echo "================================================"
echo "  RinglyPro Regression Check"
echo "  Base: $BASE_URL"
echo "================================================"
echo ""

FAIL_COUNT=0
PASS_COUNT=0

for entry in "${ENDPOINTS[@]}"; do
  IFS='|' read -r path label expected <<< "$entry"
  url="${BASE_URL}${path}"
  printf "  %-25s " "$label"

  # Use curl with 10s timeout, capture HTTP code + body
  response=$(curl -s -o /tmp/regression_body -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  body=$(cat /tmp/regression_body 2>/dev/null || echo "")

  if [ "$response" = "200" ] && echo "$body" | grep -qi "$expected"; then
    echo "PASS  ($response)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL  ($response)"
    echo "      URL: $url"
    echo "      Body: ${body:0:200}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "================================================"
echo "  Passed: $PASS_COUNT  |  Failed: $FAIL_COUNT"
echo "================================================"
echo ""

rm -f /tmp/regression_body

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "REGRESSION DETECTED — stop and investigate before continuing."
  exit 1
fi

echo "All verticals healthy."
exit 0
