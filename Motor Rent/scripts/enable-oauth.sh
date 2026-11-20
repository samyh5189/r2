#!/usr/bin/env bash
# Turns on "Continue with Google / Apple" in Supabase Auth.
#
# 1. Put the keys in ~/.config/motor-rent/oauth.env (never in git):
#      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
#      SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-xxxx
#      SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=mv.rentamotor.signin        # Services ID
#      SUPABASE_AUTH_EXTERNAL_APPLE_SECRET=eyJ...                         # client-secret JWT
# 2. Run: scripts/enable-oauth.sh
# Providers whose keys are missing stay off.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="$HOME/.config/motor-rent/oauth.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (see the comments in this script)"; exit 1; }
set -a; source "$ENV_FILE"; set +a

cfg=supabase/config.toml
toggle() { # $1 provider, $2 true|false
  python3 - "$cfg" "$1" "$2" <<'PY'
import sys, re
p, prov, val = sys.argv[1:]
s = open(p).read()
s = re.sub(r"(\[auth\.external\.%s\]\n(?:#.*\n)*enabled = )(true|false)" % prov, r"\g<1>%s" % val, s, count=1)
open(p, "w").write(s)
PY
}
for prov in google apple; do
  up=$(echo "$prov" | tr a-z A-Z)
  id_var="SUPABASE_AUTH_EXTERNAL_${up}_CLIENT_ID"; secret_var="SUPABASE_AUTH_EXTERNAL_${up}_SECRET"
  if [ -n "${!id_var:-}" ] && [ -n "${!secret_var:-}" ]; then toggle "$prov" true; echo "✓ $prov on"; else
    export "$id_var"="" "$secret_var"=""; toggle "$prov" false; echo "– $prov off (keys missing)"; fi
done
supabase config push --project-ref xknvywpfnsnsvzuicuff
