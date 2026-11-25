#!/bin/sh
# scripts/nginx-upstream.sh — runs inside the nginx container at startup.
# Reads the active blue/green instance and creates the upstream config.
ACTIVE=$(cat /etc/nginx/active 2>/dev/null || echo blue)
echo "set \$upstream_app app-$ACTIVE:3000;" > /etc/nginx/conf.d/upstream.conf
rm -f /etc/nginx/conf.d/default.conf
