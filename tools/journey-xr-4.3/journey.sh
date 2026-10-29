#!/usr/bin/env bash
# XR-4.3 isolated live journey: MARKET -> CORE -> MOVE -> CORE -> MARKET on
# THREE fresh local PostgreSQL databases. Never touches Render, Supabase or any
# shared database: it refuses to run unless PG points at localhost.
#
# Layout: the three checkouts are siblings:  <dir>/wasla  <dir>/wasla-core  <dir>/ceezr
# and this script lives in wasla-core/tools/journey-xr-4.3/.
# Needs: postgres 16+ with postgis, node 20, pnpm deps installed in wasla,
# npm deps in wasla-core, bun deps in ceezr, openssl, curl, python3.
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd); W=$(cd "$H/../../.." && pwd)
ln -sfn "$W/wasla/services/delivery/node_modules" "$H/node_modules"   # market-node resolves pg from MARKET
export PATH=~/.npm-global/bin:~/.bun/bin:$PATH
PGBASE=${PGBASE:-postgres://postgres:pg@localhost}
case "$PGBASE" in *@localhost*|*@127.0.0.1*) ;; *) echo "refusing: PGBASE must be local"; exit 2;; esac
ORG=11111111-1111-4111-8111-111111111111
MSEC=market-journey-secret-$(openssl rand -hex 16); VSEC=move-journey-secret-$(openssl rand -hex 16)
T=$(mktemp -d); trap 'pkill -f market-node.ts; pkill -f move-node.ts; pkill -f "vite-node src/server.ts"; true' EXIT
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; PASS=$((PASS+1)); else echo "  FAIL  $1: got '$2' want '$3'"; FAIL=$((FAIL+1)); fi; }
q() { psql -qAt "$PGBASE/$1" -c "$2"; }
C="curl -sk -H content-type:application/json"
waitfor() { for i in $(seq 1 40); do v=$(eval "$2" 2>/dev/null || true); [ "$v" = "$3" ] && { echo "$v"; return; }; sleep 0.5; done; echo "$v"; }

echo "== 1. fresh databases + migrations"
for d in xr43_market xr43_core xr43_move; do psql -q "$PGBASE/postgres" -c "drop database if exists $d" -c "create database $d"; done
psql -q "$PGBASE/xr43_move" -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if; end \$\$;"
(cd "$W/wasla-core" && DATABASE_URL=$PGBASE/xr43_core node scripts/db-migrate.mjs up >/dev/null)
(cd "$W/wasla/services/delivery" && DATABASE_URL=$PGBASE/xr43_market npx tsx src/db/migrate-cli.ts >/dev/null)
(cd "$W/ceezr" && DATABASE_URL=$PGBASE/xr43_move bun run scripts/migrate.ts >/dev/null)
# MOVE's CORE integration is parked in deferred/ (O-7). Applied HERE ONLY, to a throwaway local DB.
for f in $(ls "$W/ceezr/deferred/core-integration/migrations/"*.sql | sort); do psql -q -v ON_ERROR_STOP=1 "$PGBASE/xr43_move" -f "$f" >/dev/null; done
echo "  migrated: core=$(q xr43_core "select count(*) from schema_migrations" 2>/dev/null || echo ?) market=ok move=ok"

echo "== 2. CORE seed: organization + service credentials (wasla-market, wasla-move, operator)"
q xr43_core "insert into organization(organization_id,name,country_code,source_system) values ('$ORG','xr43-journey','SA','journey')" >/dev/null
boot() { (cd "$W/wasla-core" && DATABASE_URL=$PGBASE/xr43_core npx vite-node src/platform/bootstrap/main.ts -- --service-name "$1" --organization $ORG ${2:-}) | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"; }
MTOK=$(boot wasla-market); VTOK=$(boot wasla-move); OTOK=$(boot xr43-operator "--roles platform_admin")

echo "== 3. TLS for local webhooks (CORE refuses non-https subscribers)"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$H/key.pem" -out "$H/cert.pem" -days 1 -subj /CN=localhost -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null

echo "== 4. start CORE :18080, MARKET :18070, MOVE :18090"
(cd "$W/wasla-core" && NODE_EXTRA_CA_CERTS="$H/cert.pem" DATABASE_URL=$PGBASE/xr43_core PORT=18080 INBOUND_DISPATCH_INTERVAL_MS=300 EVENT_DELIVERY_INTERVAL_MS=300 nohup npx vite-node src/server.ts > "$T/core.log" 2>&1 & echo $! > "$T/core.pid")
(cd "$W/wasla/services/delivery" && MARKET_DATABASE_URL=$PGBASE/xr43_market CORE_ORGANIZATION_ID=$ORG CORE_BASE_URL=http://localhost:18080 CORE_MARKET_TOKEN=$MTOK MARKET_INBOUND_SIGNING_SECRET=$MSEC PORT=18070 nohup npx tsx "$H/market-node.ts" > "$T/market.log" 2>&1 & echo $! > "$T/market.pid")
(cd "$H" && MOVE_DATABASE_URL=$PGBASE/xr43_move CORE_EVENTS_BASE_URL=http://localhost:18080 CORE_EVENTS_BEARER_TOKEN=$VTOK CORE_INBOUND_SIGNING_SECRET=$VSEC PORT=18090 nohup bun run move-node.ts > "$T/move.log" 2>&1 & echo $! > "$T/move.pid")
for u in http://localhost:18080/health https://localhost:18070/control/relay-status https://localhost:18090/control/state; do for i in $(seq 1 60); do curl -sk -o /dev/null "$u" && break; sleep 0.5; done; done
sub() { $C -XPOST localhost:18080/v1/event-subscriptions -H "authorization: Bearer $OTOK" -d "{\"subscriber\":\"$1\",\"event_type\":\"core.fulfillment.$2\",\"endpoint_url\":\"$3\",\"signing_secret\":\"$4\"}" >/dev/null; }
for e in created cancelled; do sub move $e https://localhost:18090/webhook/core-events $VSEC; done
for e in dispatched completed cancelled; do sub market $e https://localhost:18070/webhook/core-fulfillment $MSEC; done
M=https://localhost:18070; V=https://localhost:18090
place() { $C -XPOST $M/control/place -d "${1:-{\}}" | python3 -c "import json,sys;print(json.load(sys.stdin)['order']['publicId'])"; }
state() { q xr43_market "select fulfillment_state from store_orders where public_id='$1'"; }
job() { q xr43_move "select $2 from operational_jobs where order_reference='$1'"; }
core() { q xr43_core "select status from fulfillment where market_order_reference='$1'"; }
# Retryable outcomes are not written to the inbox (only terminal ones are), so read what MARKET answered.
inboxlast() { $C "$M/control/last?ref=$1&type=$2" | python3 -c "import json,sys;print(json.load(sys.stdin)['result'] or '')"; }

echo "== A. happy path: place -> CORE -> MOVE job -> accept -> complete -> proof -> delivered"
P=$(place); $C -XPOST $M/control/relay >/dev/null
check "CORE fulfillment created" "$(waitfor x "core $P" coordinating)" coordinating
check "MOVE job opened from core.fulfillment.created" "$(waitfor x "job $P state" coordinating)" coordinating
F=$(job $P fulfillment_id)
$C -XPOST $V/control/accept -d "{\"fulfillment_id\":\"$F\"}" >/dev/null; $C -XPOST $V/control/ship >/dev/null
check "CORE dispatched on move.job.accepted" "$(waitfor x "core $P" dispatched)" dispatched
check "MARKET refuses assignment before the store is ready (retryable)" "$(waitfor x "inboxlast $P core.fulfillment.dispatched" out_of_order)" out_of_order
$C -XPOST $M/control/walk -d "{\"publicId\":\"$P\"}" >/dev/null
check "CORE retry lands once the store is ready: assigned (D-XR-31)" "$(waitfor x "state $P" assigned)" assigned
$C -XPOST $V/control/complete -d "{\"fulfillment_id\":\"$F\"}" >/dev/null; $C -XPOST $V/control/ship >/dev/null
check "CORE completed on move.job.completed" "$(waitfor x "core $P" completed)" completed
check "MARKET holds delivered without proof (G-4)" "$(waitfor x "inboxlast $P core.fulfillment.completed" proof_missing)" proof_missing
check "order NOT delivered without proof" "$(state $P)" assigned
$C -XPOST $M/control/proof -d "{\"orderRef\":\"$P\",\"proofRef\":\"otp:$(openssl rand -hex 3)\"}" >/dev/null
check "delivered after proof, on CORE's own retry" "$(waitfor x "state $P" delivered)" delivered

echo "== B. duplicates and forgery"
q xr43_market "update core_egress_outbox set published_at=null where entity_id='$P' or payload->>'order_reference'='$P'" >/dev/null; $C -XPOST $M/control/relay >/dev/null; sleep 2
check "replayed market.order.created makes no second fulfillment" "$(q xr43_core "select count(*) from fulfillment where market_order_reference='$P'")" 1
BODY=$(q xr43_core "select row_to_json(t) from (select event_id,event_type,version,producer,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') occurred_at,correlation_id,causation_id,entity_type,entity_id,payload from outbox where event_type='core.fulfillment.completed' and payload->>'order_reference'='$P') t")
SIG=sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$MSEC" -r | cut -d' ' -f1)
check "re-delivered signed webhook is a duplicate" "$($C -XPOST $M/webhook/core-fulfillment -H "x-wasla-signature: $SIG" -d "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)['result'])")" duplicate
check "forged signature refused" "$($C -o /dev/null -w %{http_code} -XPOST $M/webhook/core-fulfillment -H "x-wasla-signature: sha256=$(printf '%064d' 0)" -d "$BODY")" 401
EV=$(q xr43_market "select row_to_json(t) from (select event_id,event_type,version,producer,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') occurred_at,correlation_id,causation_id,entity_type,entity_id,payload from core_egress_outbox limit 1) t")
check "MOVE credential cannot submit market.* (spoofing)" "$(curl -s -o /dev/null -w %{http_code} -XPOST localhost:18080/v1/events -H "authorization: Bearer $VTOK" -H content-type:application/json -d "$EV")" 403
check "no credential, no ingress" "$(curl -s -o /dev/null -w %{http_code} -XPOST localhost:18080/v1/events -H content-type:application/json -d "$EV")" 401

echo "== C. MOVE rejects (no courier)"
P2=$(place); $C -XPOST $M/control/walk -d "{\"publicId\":\"$P2\"}" >/dev/null; $C -XPOST $M/control/relay >/dev/null
waitfor x "job $P2 state" coordinating >/dev/null; F2=$(job $P2 fulfillment_id)
$C -XPOST $V/control/reject -d "{\"fulfillment_id\":\"$F2\",\"reason\":\"no_courier_available\"}" >/dev/null; $C -XPOST $V/control/ship >/dev/null
check "CORE closes failed" "$(waitfor x "core $P2" failed)" failed
check "MARKET has no edge ready_for_delivery->failed (G-7): stuck, retried" "$(waitfor x "inboxlast $P2 core.fulfillment.completed" out_of_order)" out_of_order
check "order left in ready_for_delivery" "$(state $P2)" ready_for_delivery

echo "== D. customer cancels"
P3=$(place); $C -XPOST $M/control/relay >/dev/null; waitfor x "job $P3 state" coordinating >/dev/null
$C -XPOST $M/control/cancel -d "{\"publicId\":\"$P3\"}" >/dev/null; sleep 2
check "MARKET cancelled" "$(state $P3)" cancelled
check "MOVE job still open: MARKET cancel never reaches CORE (G-6)" "$(job $P3 state)" coordinating
F3=$(job $P3 fulfillment_id)
$C -XPOST localhost:18080/v1/fulfillments/$F3/cancel -H "authorization: Bearer $MTOK" -d '{"reason":"customer_cancelled"}' >/dev/null
check "with the missing call made: MOVE job cancelled" "$(waitfor x "job $P3 state" cancelled)" cancelled

echo "== E. store with no CORE organization (XR-6.1 not bound)"
P4=$(place '{"unbound":true}')
check "held durably, nothing sent" "$(q xr43_market "select reason from core_egress_blocked where order_public_id='$P4'")" organization_not_linked

echo "== F. CORE down at relay time"
pkill -f "vite-node src/server.ts" || true; sleep 1
P5=$(place); R=$($C -XPOST $M/control/relay)
check "relay records the failure, keeps the row" "$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin)['failed'])")" 1
(cd "$W/wasla-core" && NODE_EXTRA_CA_CERTS="$H/cert.pem" DATABASE_URL=$PGBASE/xr43_core PORT=18080 INBOUND_DISPATCH_INTERVAL_MS=300 EVENT_DELIVERY_INTERVAL_MS=300 nohup npx vite-node src/server.ts >> "$T/core.log" 2>&1 & echo $! > "$T/core.pid")
for i in $(seq 1 60); do curl -s -o /dev/null localhost:18080/health && break; sleep 0.5; done
$C -XPOST $M/control/relay >/dev/null
check "after CORE returns the same order reaches MOVE" "$(waitfor x "job $P5 state" coordinating)" coordinating

echo; echo "RESULT: $PASS passed, $FAIL failed"; rm -f "$H/key.pem" "$H/cert.pem"; [ "$FAIL" = 0 ]
