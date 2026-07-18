#!/bin/sh
set -eu

template=/etc/nginx/templates/default.conf.otte
output=/etc/nginx/conf.d/default.conf
configured=${OTTE_ASSET_CDN_BASE_URL:-}
origin=

if [ -n "$configured" ]; then
  case "$configured" in
    https://*) scheme=https ;;
    http://*) scheme=http ;;
    *)
      echo "OTTE_ASSET_CDN_BASE_URL must be an absolute HTTP(S) URL" >&2
      exit 1
      ;;
  esac

  authority=${configured#*://}
  authority=${authority%%/*}
  if ! printf '%s' "$authority" | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?$'; then
    echo "OTTE_ASSET_CDN_BASE_URL must have a credential-free, non-wildcard host" >&2
    exit 1
  fi

  port=$(printf '%s' "$authority" | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')
  if [ -n "$port" ] && [ "$port" -gt 65535 ]; then
    echo "OTTE_ASSET_CDN_BASE_URL port is outside the valid range" >&2
    exit 1
  fi

  if [ "$scheme" = http ]; then
    case "$authority" in
      localhost|localhost:[0-9]*|127.0.0.1|127.0.0.1:[0-9]*|'[::1]'|'[::1]':[0-9]*) ;;
      *)
        echo "OTTE_ASSET_CDN_BASE_URL must use HTTPS outside loopback development" >&2
        exit 1
        ;;
    esac
  fi
  origin=" $scheme://$authority"
fi

OTTE_ASSET_CDN_CONNECT_SOURCE=$origin
export OTTE_ASSET_CDN_CONNECT_SOURCE
envsubst '${OTTE_ASSET_CDN_CONNECT_SOURCE}' < "$template" > "$output"
