create or replace function public.get_event_tracking(_event_id uuid)
returns table (meta_pixel_id text, tracking_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pp.meta_pixel_id, pp.tracking_enabled
  from public.events e
  join public.producer_profiles pp on pp.id = e.producer_profile_id
  where e.id = _event_id
    and coalesce(pp.tracking_enabled, false) = true
    and pp.meta_pixel_id is not null;
$$;

grant execute on function public.get_event_tracking(uuid) to anon, authenticated;