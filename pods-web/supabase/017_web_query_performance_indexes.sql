-- Web panel query performance indexes
-- Focus: dashboard + tasks list + chain step lookups

-- Dashboard / tasks list common filters:
--   where ana_sirket_id = ? and birim_id in (?) order by updated_at desc
create index if not exists idx_isler_company_unit_updated_at
  on public.isler (ana_sirket_id, birim_id, updated_at desc);

-- Company-scoped screens that sort by recency without unit filter.
create index if not exists idx_isler_company_updated_at
  on public.isler (ana_sirket_id, updated_at desc);

-- Status-oriented scans used by KPI and task status filters.
create index if not exists idx_isler_status_updated_at
  on public.isler (durum, updated_at desc);

-- Operator and assignee-centric queries.
create index if not exists idx_isler_assignee_updated_at
  on public.isler (sorumlu_personel_id, updated_at desc);

-- Overdue and date-range scans.
create index if not exists idx_isler_due_date
  on public.isler (son_tarih);

create index if not exists idx_isler_start_date
  on public.isler (baslama_tarihi);

-- Chain step lookups:
--   where is_id in (...) order by adim_no desc
create index if not exists idx_zincir_gorev_is_id_adim_no
  on public.isler_zincir_gorev_adimlari (is_id, adim_no desc);

