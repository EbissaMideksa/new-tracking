#!/bin/bash
# scripts/generate-cert.sh — local root CA + server cert for the nginx deployment.
#
# WSL2 changes its eth0 IP on reboot, so a cert pinned to one IP goes stale.
# This script keeps a STABLE local root CA (import it into Firefox / the
# Windows trust store ONCE) and issues a fresh server cert — valid for
# localhost, 127.0.0.1 and the current WSL IP — signed by that CA.
#
# Regenerating the server cert later (e.g. after an IP change) does NOT require
# re-importing the CA: browsers already trust the CA, so the new leaf is trusted
# automatically.
#
# Usage:  ./scripts/generate-cert.sh        # or:  make cert
#         ./scripts/generate-cert.sh 10.0.0.5 myhost   # extra SANs
set -euo pipefail

SSL_DIR="nginx/ssl"
mkdir -p "$SSL_DIR"

CA_CERT="$SSL_DIR/ca.pem"      # ← import THIS into Firefox Authorities / Windows store
CA_KEY="$SSL_DIR/ca-key.pem"
SRV_CERT="$SSL_DIR/cert.pem"   # ← nginx serves this (the leaf, signed by the CA)
SRV_KEY="$SSL_DIR/key.pem"

# 1. Create the local root CA once (reused across regenerations).
if [ ! -s "$CA_CERT" ] || [ ! -s "$CA_KEY" ]; then
  echo "[cert] creating local root CA  →  $CA_CERT"
  echo "[cert]   (import this into Firefox/Windows ONCE — see README)"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CA_KEY" -out "$CA_CERT" -days 3650 \
    -subj "/CN=Asset Tracking Local Dev CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 600 "$CA_KEY"
  chmod 644 "$CA_CERT"
fi

# 2. Build the SAN list: localhost + 127.0.0.1 + current WSL IP + extra args.
WSL_IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1 || true)
[ -z "$WSL_IP" ] && WSL_IP="127.0.0.1"
SAN="DNS:localhost,IP:127.0.0.1,IP:${WSL_IP}"
for extra in "$@"; do
  if [[ "$extra" =~ ^[0-9.]+$ ]]; then SAN="${SAN},IP:${extra}"; else SAN="${SAN},DNS:${extra}"; fi
done
echo "[cert] issuing server cert signed by local CA for: ${SAN}"

# 3. Back up existing leaf, then generate a new leaf key + CSR.
[ -f "$SRV_CERT" ] && cp "$SRV_CERT" "$SRV_CERT.bak"
[ -f "$SRV_KEY" ]  && cp "$SRV_KEY"  "$SRV_KEY.bak"
openssl req -newkey rsa:2048 -nodes -keyout "$SRV_KEY" -out "$SSL_DIR/server.csr" -subj "/CN=localhost"

# 4. Sign the leaf with the CA, embedding SANs + server EKU.
EXT="$SSL_DIR/server.ext"
cat > "$EXT" <<EOF
subjectAltName=${SAN}
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
rm -f "$SSL_DIR/ca.srl"
openssl x509 -req -in "$SSL_DIR/server.csr" \
  -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$SRV_CERT" -days 825 -extfile "$EXT"
rm -f "$SSL_DIR/server.csr" "$EXT" "$SSL_DIR/ca.srl"
chmod 600 "$SRV_KEY"
chmod 644 "$SRV_CERT"

echo "[cert] ✓ server cert: $SRV_CERT"
openssl x509 -in "$SRV_CERT" -noout -subject -issuer
openssl x509 -in "$SRV_CERT" -noout -ext subjectAltName
echo "[cert] ✓ root CA: $CA_CERT  (import into Firefox Authorities / Windows store)"

# 5. Reload nginx if the container is running so it serves the new leaf.
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^asset_tracking_nginx$'; then
  echo "[cert] reloading nginx ..."
  docker exec asset_tracking_nginx nginx -s reload && echo "[cert] ✓ nginx reloaded"
else
  echo "[cert] nginx container not running — reload after starting the stack"
fi
