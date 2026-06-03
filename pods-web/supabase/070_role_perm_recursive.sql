-- 070: role_perm_truthy — tüm JSON ağacında arama (çok katmanlı kategori)
-- 068/069 uygulandıktan sonra çalıştırın.

BEGIN;

CREATE OR REPLACE FUNCTION public._role_perm_jsonb_search(p_node jsonb, p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  ent record;
BEGIN
  IF p_node IS NULL OR jsonb_typeof(p_node) <> 'object' THEN
    RETURN false;
  END IF;

  IF public._role_perm_leaf_truthy(p_node, p_key) THEN
    RETURN true;
  END IF;

  IF p_key = 'rol.yonet' THEN
    IF public._role_perm_leaf_truthy(p_node, 'rol_yonet') THEN RETURN true; END IF;
    IF public._role_perm_leaf_truthy(p_node, 'roller_yonet') THEN RETURN true; END IF;
  ELSIF p_key = 'personel.yonet' THEN
    IF public._role_perm_leaf_truthy(p_node, 'personel_yonet') THEN RETURN true; END IF;
  ELSIF p_key = 'proje.yonet' THEN
    IF public._role_perm_leaf_truthy(p_node, 'proje_yonet') THEN RETURN true; END IF;
  END IF;

  FOR ent IN SELECT key, value FROM jsonb_each(p_node)
  LOOP
    IF jsonb_typeof(ent.value) = 'object'
      AND public._role_perm_jsonb_search(ent.value, p_key)
    THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.role_perm_truthy(p_yetkiler jsonb, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public._role_perm_jsonb_search(coalesce(p_yetkiler, '{}'::jsonb), p_key);
$$;

COMMIT;
