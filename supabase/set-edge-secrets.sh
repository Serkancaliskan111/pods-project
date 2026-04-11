#!/usr/bin/env bash
# Service role JWT'yi Edge Function secret olarak yükler.
# NOT: supabase secrets set, SUPABASE_ ile başlayan isimlere izin vermez; bu yüzden PODS_SERVICE_ROLE_KEY kullanılır.
# Önce: supabase login
# Proje kökünden: bash supabase/set-edge-secrets.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/supabase/.env"

DEFAULT_PROJECT_REF="uvsemkioahjrkryetltp"
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Dosya yok: $ENV_FILE"
  echo "Oluştur: cp supabase/.env.example supabase/.env"
  echo "Satır: PODS_SERVICE_ROLE_KEY=eyJ... (tek satır)"
  exit 1
fi

SERVICE_KEY=""
PROJECT_REF_FROM_FILE=""
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line//$'\r'/}"
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  if [[ "$line" == SUPABASE_PROJECT_REF=* ]]; then
    PROJECT_REF_FROM_FILE="${line#SUPABASE_PROJECT_REF=}"
    PROJECT_REF_FROM_FILE="${PROJECT_REF_FROM_FILE//\"/}"
    PROJECT_REF_FROM_FILE="${PROJECT_REF_FROM_FILE//\'/}"
    PROJECT_REF_FROM_FILE="${PROJECT_REF_FROM_FILE// /}"
  elif [[ "$line" == PODS_SERVICE_ROLE_KEY=* ]]; then
    SERVICE_KEY="${line#PODS_SERVICE_ROLE_KEY=}"
  elif [[ "$line" == SUPABASE_SERVICE_ROLE_KEY=* ]]; then
    # Eski .env uyumluluğu — CLI'ya yine PODS_ adıyla gider
    SERVICE_KEY="${line#SUPABASE_SERVICE_ROLE_KEY=}"
  fi
  if [[ -n "$SERVICE_KEY" ]]; then
    SERVICE_KEY="${SERVICE_KEY#"${SERVICE_KEY%%[![:space:]]*}"}"
    SERVICE_KEY="${SERVICE_KEY%"${SERVICE_KEY##*[![:space:]]}"}"
    if [[ "$SERVICE_KEY" == \"*\" ]]; then
      SERVICE_KEY="${SERVICE_KEY#\"}"
      SERVICE_KEY="${SERVICE_KEY%\"}"
    elif [[ "$SERVICE_KEY" == \'*\' ]]; then
      SERVICE_KEY="${SERVICE_KEY#\'}"
      SERVICE_KEY="${SERVICE_KEY%\'}"
    fi
  fi
done < "$ENV_FILE"

if [[ -z "$PROJECT_REF" ]]; then
  PROJECT_REF="$PROJECT_REF_FROM_FILE"
fi
if [[ -z "$PROJECT_REF" ]]; then
  PROJECT_REF="$DEFAULT_PROJECT_REF"
fi

if [[ -z "$SERVICE_KEY" ]]; then
  echo "supabase/.env içinde PODS_SERVICE_ROLE_KEY=... (veya eski SUPABASE_SERVICE_ROLE_KEY=) bulunamadı."
  echo "Örnek:"
  echo "  PODS_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs..."
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI yok: https://supabase.com/docs/guides/cli"
  exit 1
fi

cd "$ROOT"

supabase secrets set \
  "PODS_SERVICE_ROLE_KEY=${SERVICE_KEY}" \
  --project-ref "$PROJECT_REF" \
  --yes

echo "Secret ayarlandı: PODS_SERVICE_ROLE_KEY (project-ref: $PROJECT_REF)."
echo "admin-create-user fonksiyonu bunu otomatik okur (deploy gerekir)."
echo "Sonraki adım: supabase functions deploy admin-create-user --project-ref $PROJECT_REF"
