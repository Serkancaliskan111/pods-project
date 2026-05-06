-- ============================================================================
-- Şema anlık görüntüsü (tek sonuç metni) — Supabase SQL Editor’da çalıştırın.
-- Sonuç gridinde tek satır / tek sütun (snapshot) çıkar; tüm hücreyi kopyalayıp
-- ../system_database_snapshot.sql dosyasına yapıştırın (veya sohbete iletin).
--
-- Tam DDL için alternatif (daha ağır, terminal): projede
--   supabase db dump --schema public --schema-only -f supabase/system_database_snapshot.sql
-- veya pg_dump ile aynı parametreler.
-- ============================================================================

SELECT
  concat_ws(
    E'\n\n',
    '-- =====================================================================',
    '-- PODS schema snapshot (public)',
    '-- Üretim zamanı (DB): ' || now()::timestamptz::text,
    '-- =====================================================================',

    '-- EXTENSIONS',
    COALESCE(
      (
        SELECT string_agg(extname || COALESCE(': ' || extversion, ''), E'\n' ORDER BY extname)
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE n.nspname = 'public'
           OR extname IN ('uuid-ossp', 'pgcrypto', 'pg_graphql', 'pg_stat_statements', 'supabase_vault')
      ),
      '(yok)'
    ),

    '-- TABLES + COLUMNS (okunabilir özet; tam DDL değil)',
    COALESCE(
      (
        SELECT string_agg(
          format(
            E'-- TABLE %I\n(\n%s\n);',
            c.relname,
            COALESCE(
              (
                SELECT string_agg(
                  format(
                    '  %I %s%s%s',
                    a.attname,
                    pg_catalog.format_type(a.atttypid, a.atttypmod),
                    CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
                    CASE
                      WHEN a.atthasdef THEN ' DEFAULT ' || pg_get_expr(ad.adbin, a.attrelid)
                      ELSE ''
                    END
                  ),
                  E',\n'
                  ORDER BY a.attnum
                )
                FROM pg_catalog.pg_attribute a
                LEFT JOIN pg_catalog.pg_attrdef ad
                  ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
                WHERE a.attrelid = c.oid
                  AND a.attnum > 0
                  AND NOT a.attisdropped
              ),
              '  -- (sütun okunamadı)'
            )
          ),
          E'\n\n'
          ORDER BY c.relname
        )
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
      ),
      '(tablo yok)'
    ),

    '-- PRIMARY / UNIQUE / CHECK (table constraints)',
    COALESCE(
      (
        SELECT string_agg(pg_get_constraintdef(c.oid, true) || ';', E'\n' ORDER BY c.conname)
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
          AND c.contype IN ('p', 'u', 'c')
      ),
      '(yok)'
    ),

    '-- FOREIGN KEYS',
    COALESCE(
      (
        SELECT string_agg(
          format('%I.%I: %s;', cl.relname, c.conname, pg_get_constraintdef(c.oid, true)),
          E'\n'
          ORDER BY cl.relname, c.conname
        )
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
        JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
        WHERE n.nspname = 'public'
          AND c.contype = 'f'
      ),
      '(yok)'
    ),

    '-- INDEXES (pg_indexes)',
    COALESCE(
      (
        SELECT string_agg(indexdef || ';', E'\n' ORDER BY tablename, indexname)
        FROM pg_indexes
        WHERE schemaname = 'public'
      ),
      '(yok)'
    ),

    '-- VIEWS',
    COALESCE(
      (
        SELECT string_agg(
          format(E'-- VIEW %I\n%s;', viewname, definition),
          E'\n\n'
          ORDER BY viewname
        )
        FROM pg_views
        WHERE schemaname = 'public'
      ),
      '(yok)'
    ),

    '-- FUNCTIONS (public, LANGUAGE sql/plpgsql …)',
    COALESCE(
      (
        SELECT string_agg(pg_get_functiondef(p.oid), E'\n\n' ORDER BY p.proname, p.oid)
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
      ),
      '(yok)'
    ),

    '-- TRIGGERS (internal olmayan)',
    COALESCE(
      (
        SELECT string_agg(pg_get_triggerdef(t.oid, true) || ';', E'\n' ORDER BY c.relname, t.tgname)
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND NOT t.tgisinternal
      ),
      '(yok)'
    ),

    '-- RLS (pg_policies)',
    COALESCE(
      (
        SELECT string_agg(
          format(
            E'POLICY %I ON %I.%I\n  cmd=%s\n  roles=%s\n  qual=%s\n  with_check=%s',
            policyname,
            schemaname,
            tablename,
            cmd,
            roles::text,
            COALESCE(qual::text, ''),
            COALESCE(with_check::text, '')
          ),
          E'\n\n'
          ORDER BY tablename, policyname
        )
        FROM pg_policies
        WHERE schemaname = 'public'
      ),
      '(policy yok)'
    )
  ) AS snapshot;
