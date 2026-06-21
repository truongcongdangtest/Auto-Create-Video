#!/usr/bin/env bash
# Throwaway: sequential cloud render of both illustrated videos.
# LucyLab allows only 1 export at a time -> never trigger both at once.
set -u
cd "$(dirname "$0")"

MMO_ID="$1"   # already-triggered MMO run id, passed in

echo "[1/2] watching MMO run $MMO_ID ..."
gh run watch "$MMO_ID" --exit-status >/dev/null 2>&1
MMO_RC=$?
MMO_CONC=$(gh run view "$MMO_ID" --json conclusion -q .conclusion 2>/dev/null)
echo "MMO conclusion=$MMO_CONC rc=$MMO_RC"

# Trigger YouTube only after MMO finished (success or fail — we still want it)
echo "[2/2] triggering YouTube render ..."
gh workflow run render.yml -f job_dir=jobs/youtube-faceless-tach-kenh >/dev/null 2>&1
sleep 10
YT_ID=$(gh run list --workflow=render.yml --limit 1 --json databaseId -q '.[0].databaseId')
echo "YT run id=$YT_ID"
gh run watch "$YT_ID" --exit-status >/dev/null 2>&1
YT_CONC=$(gh run view "$YT_ID" --json conclusion -q .conclusion 2>/dev/null)
echo "YT conclusion=$YT_CONC"

# Download artifacts
rm -rf downloads/mmo-illu3 downloads/youtube-illu3
if [ "$MMO_CONC" = "success" ]; then
  gh run download "$MMO_ID" -D downloads/mmo-illu3 >/dev/null 2>&1 && echo "downloaded MMO -> downloads/mmo-illu3"
fi
if [ "$YT_CONC" = "success" ]; then
  gh run download "$YT_ID" -D downloads/youtube-illu3 >/dev/null 2>&1 && echo "downloaded YT -> downloads/youtube-illu3"
fi

echo "SEQDONE MMO=$MMO_ID|$MMO_CONC YT=$YT_ID|$YT_CONC"
