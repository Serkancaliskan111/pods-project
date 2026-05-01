-- Task timeline support: completion/review timestamps and resubmission count

alter table public.isler
  add column if not exists tamamlama_gecmisi jsonb not null default '[]'::jsonb,
  add column if not exists denetim_gecmisi jsonb not null default '[]'::jsonb,
  add column if not exists tekrar_gonderim_sayisi integer not null default 0;

create or replace function public.log_task_timeline_event(
  p_task_id uuid,
  p_event text,
  p_actor_id uuid default null,
  p_note text default null,
  p_at timestamptz default now()
)
returns void
language plpgsql
security definer
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'at', to_char(coalesce(p_at, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor_id', p_actor_id,
    'note', p_note
  );

  if p_event = 'completion' then
    update public.isler
      set tamamlama_gecmisi = coalesce(tamamlama_gecmisi, '[]'::jsonb) || jsonb_build_array(v_payload)
    where id = p_task_id;
  elsif p_event = 'review' then
    update public.isler
      set denetim_gecmisi = coalesce(denetim_gecmisi, '[]'::jsonb) || jsonb_build_array(v_payload)
    where id = p_task_id;
  elsif p_event = 'resubmitted' then
    update public.isler
      set tekrar_gonderim_sayisi = coalesce(tekrar_gonderim_sayisi, 0) + 1
    where id = p_task_id;
  end if;
end;
$$;

grant execute on function public.log_task_timeline_event(uuid, text, uuid, text, timestamptz) to authenticated;

