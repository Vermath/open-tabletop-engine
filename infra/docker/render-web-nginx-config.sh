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

# Optional voice and video provider (OTTE_CALL_EMBED_URL). When set, its origin
# is the only third-party origin the page may frame and the only one that may
# use the camera, microphone or screen capture. Unset, nothing changes.
call_configured=${OTTE_CALL_EMBED_URL:-}
call_origin=

if [ -n "$call_configured" ]; then
  case "$call_configured" in
    https://*) call_scheme=https ;;
    http://*) call_scheme=http ;;
    *)
      echo "OTTE_CALL_EMBED_URL must be an absolute HTTPS URL" >&2
      exit 1
      ;;
  esac

  call_authority=${call_configured#*://}
  call_authority=${call_authority%%[/?#]*}
  if ! printf '%s' "$call_authority" | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?$'; then
    echo "OTTE_CALL_EMBED_URL must have a credential-free, non-wildcard host without the {room} placeholder" >&2
    exit 1
  fi

  call_port=$(printf '%s' "$call_authority" | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')
  if [ -n "$call_port" ] && [ "$call_port" -gt 65535 ]; then
    echo "OTTE_CALL_EMBED_URL port is outside the valid range" >&2
    exit 1
  fi

  if [ "$call_scheme" = http ]; then
    case "$call_authority" in
      localhost|localhost:[0-9]*|127.0.0.1|127.0.0.1:[0-9]*|'[::1]'|'[::1]':[0-9]*) ;;
      *)
        echo "OTTE_CALL_EMBED_URL must use HTTPS outside loopback development" >&2
        exit 1
        ;;
    esac
  fi
  call_origin="$call_scheme://$call_authority"
fi

if [ -n "$call_origin" ]; then
  OTTE_CALL_FRAME_DIRECTIVE="; frame-src 'self' $call_origin"
  OTTE_WEB_PERMISSIONS_POLICY="camera=(self \"$call_origin\"), geolocation=(), microphone=(self \"$call_origin\"), display-capture=(self \"$call_origin\")"
else
  OTTE_CALL_FRAME_DIRECTIVE=
  OTTE_WEB_PERMISSIONS_POLICY="camera=(), geolocation=(), microphone=()"
fi
export OTTE_CALL_FRAME_DIRECTIVE OTTE_WEB_PERMISSIONS_POLICY

# `--print` shows the computed values without writing the nginx configuration.
if [ "${1:-}" = "--print" ]; then
  printf 'OTTE_ASSET_CDN_CONNECT_SOURCE=%s\n' "$OTTE_ASSET_CDN_CONNECT_SOURCE"
  printf 'OTTE_CALL_FRAME_DIRECTIVE=%s\n' "$OTTE_CALL_FRAME_DIRECTIVE"
  printf 'OTTE_WEB_PERMISSIONS_POLICY=%s\n' "$OTTE_WEB_PERMISSIONS_POLICY"
  exit 0
fi

envsubst '${OTTE_ASSET_CDN_CONNECT_SOURCE} ${OTTE_CALL_FRAME_DIRECTIVE} ${OTTE_WEB_PERMISSIONS_POLICY}' < "$template" > "$output"
