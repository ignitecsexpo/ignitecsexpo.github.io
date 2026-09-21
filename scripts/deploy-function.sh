#!/bin/bash
# Create (first time) and deploy the expo-api Appwrite function.
#   APPWRITE_ENDPOINT=... APPWRITE_PROJECT=... APPWRITE_KEY=... ./scripts/deploy-function.sh
set -euo pipefail
: "${APPWRITE_ENDPOINT:?}" "${APPWRITE_PROJECT:?}" "${APPWRITE_KEY:?}"
FN=expo-api
H=(-H "X-Appwrite-Project: $APPWRITE_PROJECT" -H "X-Appwrite-Key: $APPWRITE_KEY")
BODY=$(cat <<JSON
{"functionId":"$FN","name":"Expo API","runtime":"${RUNTIME:-node-22}","execute":["any"],
 "events":[],
 "timeout":60,"enabled":true,"logging":true,"entrypoint":"src/main.js","commands":"npm install",
 "scopes":["rows.read","rows.write","tables.read","databases.read","teams.read"]}
JSON
)
echo "== function"
curl -sS -X POST "$APPWRITE_ENDPOINT/functions" "${H[@]}" -H "Content-Type: application/json" -d "$BODY" | jq -c '{id: ."$id", message}'
curl -sS -X PUT "$APPWRITE_ENDPOINT/functions/$FN" "${H[@]}" -H "Content-Type: application/json" -d "$BODY" | jq -c '{updated: ."$id", runtime, message}'
echo "== deployment"
TMP=$(mktemp -d); tar -czf "$TMP/code.tar.gz" -C "$(dirname "$0")/../functions/expo-api" package.json src
curl -sS -X POST "$APPWRITE_ENDPOINT/functions/$FN/deployments" "${H[@]}" \
  -F "code=@$TMP/code.tar.gz" -F "activate=true" -F "entrypoint=src/main.js" -F "commands=npm install" | jq -c '{deployment: ."$id", status, message}'
