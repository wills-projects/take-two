create table if not exists public.shared_collection (
  id text primary key check (id = 'take-two'),
  revision bigint not null default 1,
  films jsonb not null default '[]'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shared_collection enable row level security;
revoke all on public.shared_collection from public, anon, authenticated;
grant select, insert, update on public.shared_collection to service_role;

create or replace function public.save_take_two_shared_data(
  p_films jsonb,
  p_watchlist jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_row public.shared_collection;
begin
  if p_expected_revision = 0 then
    insert into public.shared_collection (id, revision, films, watchlist)
    values ('take-two', 1, p_films, p_watchlist)
    on conflict (id) do nothing
    returning * into saved_row;
  else
    update public.shared_collection
    set revision = revision + 1,
        films = p_films,
        watchlist = p_watchlist,
        updated_at = now()
    where id = 'take-two'
      and revision = p_expected_revision
    returning * into saved_row;
  end if;

  if found then
    return jsonb_build_object(
      'saved', true,
      'revision', saved_row.revision,
      'films', saved_row.films,
      'watchlist', saved_row.watchlist,
      'updated_at', saved_row.updated_at
    );
  end if;

  select * into saved_row
  from public.shared_collection
  where id = 'take-two';

  if not found then
    raise exception 'Shared collection could not be initialized';
  end if;

  return jsonb_build_object(
    'saved', false,
    'revision', saved_row.revision,
    'films', saved_row.films,
    'watchlist', saved_row.watchlist,
    'updated_at', saved_row.updated_at
  );
end;
$$;

revoke all on function public.save_take_two_shared_data(jsonb, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_take_two_shared_data(jsonb, jsonb, bigint) to service_role;
