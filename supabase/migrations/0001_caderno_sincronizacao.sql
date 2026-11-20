-- Caderno de Bolso: sincronização entre aparelhos.
-- Tudo aqui é aditivo e usa o prefixo "caderno_".
-- O acesso é só pelas funções abaixo: cada caderno tem uma chave longa e aleatória,
-- gerada no aparelho, e o servidor guarda apenas o resumo (sha256) dela.

create table if not exists public.caderno_contas (
  id            uuid primary key default gen_random_uuid(),
  chave_hash    text not null,
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now()
);

create sequence if not exists public.caderno_seq;

create table if not exists public.caderno_registros (
  conta_id      uuid not null references public.caderno_contas(id) on delete cascade,
  tipo          text not null check (tipo ~ '^[a-z_]{1,24}$'),
  id            text not null check (char_length(id) between 1 and 64),
  dados         jsonb not null,
  atualizado_em timestamptz not null,
  apagado_em    timestamptz,
  seq           bigint not null default nextval('public.caderno_seq'),
  primary key (conta_id, tipo, id)
);

create index if not exists caderno_registros_conta_seq on public.caderno_registros (conta_id, seq);

alter table public.caderno_contas    enable row level security;
alter table public.caderno_registros enable row level security;
revoke all on public.caderno_contas, public.caderno_registros from anon, authenticated;
revoke all on sequence public.caderno_seq from anon, authenticated;

create or replace function public.caderno_hash(p_chave text)
returns text language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(coalesce(p_chave, ''), 'UTF8')), 'hex') $$;

create or replace function public.caderno_chave_confere(p_conta text, p_chave text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_conta ~ '^[0-9a-f-]{36}$' and char_length(coalesce(p_chave, '')) between 43 and 128 and exists (
    select 1 from public.caderno_contas c
    where c.id = p_conta::uuid and c.chave_hash = public.caderno_hash(p_chave)
  )
$$;

create or replace function public.caderno_criar_conta(p_chave text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_chave is null or p_chave !~ '^[A-Za-z0-9_-]{43,128}$' then
    raise exception 'chave_invalida' using errcode = '22023';
  end if;
  insert into public.caderno_contas (chave_hash) values (public.caderno_hash(p_chave)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.caderno_sincronizar(
  p_conta uuid, p_chave text, p_desde bigint default 0, p_mudancas jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_m jsonb; v_total int; v_saida jsonb; v_seq bigint; v_mais boolean;
begin
  if not public.caderno_chave_confere(p_conta::text, p_chave) then
    raise exception 'chave_nao_confere' using errcode = '28000';
  end if;
  if jsonb_typeof(p_mudancas) <> 'array' or jsonb_array_length(p_mudancas) > 200 then
    raise exception 'mudancas_invalidas' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conta::text, 0));
  update public.caderno_contas set ultimo_acesso = now() where id = p_conta;

  for v_m in select * from jsonb_array_elements(p_mudancas) loop
    if pg_column_size(v_m) > 32768 then
      raise exception 'registro_grande_demais' using errcode = '22023';
    end if;
    insert into public.caderno_registros as r (conta_id, tipo, id, dados, atualizado_em, apagado_em)
    values (
      p_conta, v_m->>'tipo', v_m->>'id', coalesce(v_m->'dados', '{}'::jsonb),
      (v_m->>'atualizado_em')::timestamptz, nullif(v_m->>'apagado_em', '')::timestamptz
    )
    on conflict (conta_id, tipo, id) do update
      set dados = excluded.dados, atualizado_em = excluded.atualizado_em,
          apagado_em = excluded.apagado_em, seq = nextval('public.caderno_seq')
      where excluded.atualizado_em > r.atualizado_em;
  end loop;

  select count(*) into v_total from public.caderno_registros where conta_id = p_conta;
  if v_total > 20000 then
    raise exception 'limite_de_registros' using errcode = '54000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'id', t.id, 'dados', t.dados,
           'atualizado_em', t.atualizado_em, 'apagado_em', t.apagado_em, 'seq', t.seq) order by t.seq), '[]'::jsonb),
         coalesce(max(t.seq), p_desde), count(*) = 500
    into v_saida, v_seq, v_mais
  from (
    select * from public.caderno_registros
    where conta_id = p_conta and seq > p_desde order by seq limit 500
  ) t;

  return jsonb_build_object('seq', v_seq, 'tem_mais', v_mais, 'mudancas', v_saida);
end $$;

create or replace function public.caderno_apagar_conta(p_conta uuid, p_chave text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.caderno_chave_confere(p_conta::text, p_chave) then
    raise exception 'chave_nao_confere' using errcode = '28000';
  end if;
  delete from public.caderno_contas where id = p_conta;
end $$;

revoke all on function public.caderno_hash(text), public.caderno_chave_confere(text, text),
  public.caderno_criar_conta(text), public.caderno_sincronizar(uuid, text, bigint, jsonb),
  public.caderno_apagar_conta(uuid, text) from public;
grant execute on function public.caderno_chave_confere(text, text), public.caderno_criar_conta(text),
  public.caderno_sincronizar(uuid, text, bigint, jsonb), public.caderno_apagar_conta(uuid, text) to anon, authenticated;

-- Fotos e áudios: bucket privado; cada caderno só enxerga a própria pasta (<conta>/arquivo),
-- e a chave vai no cabeçalho "x-caderno-chave" de cada pedido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caderno-midia', 'caderno-midia', false, 6291456,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm'])
on conflict (id) do nothing;

create or replace function public.caderno_pasta_liberada(p_nome text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.caderno_chave_confere(
    split_part(p_nome, '/', 1),
    nullif(current_setting('request.headers', true), '')::json ->> 'x-caderno-chave')
$$;
revoke all on function public.caderno_pasta_liberada(text) from public;
grant execute on function public.caderno_pasta_liberada(text) to anon, authenticated;

drop policy if exists caderno_midia_ler     on storage.objects;
drop policy if exists caderno_midia_enviar  on storage.objects;
drop policy if exists caderno_midia_trocar  on storage.objects;
drop policy if exists caderno_midia_apagar  on storage.objects;
create policy caderno_midia_ler    on storage.objects for select to anon, authenticated
  using (bucket_id = 'caderno-midia' and public.caderno_pasta_liberada(name));
create policy caderno_midia_enviar on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'caderno-midia' and public.caderno_pasta_liberada(name));
create policy caderno_midia_trocar on storage.objects for update to anon, authenticated
  using (bucket_id = 'caderno-midia' and public.caderno_pasta_liberada(name))
  with check (bucket_id = 'caderno-midia' and public.caderno_pasta_liberada(name));
create policy caderno_midia_apagar on storage.objects for delete to anon, authenticated
  using (bucket_id = 'caderno-midia' and public.caderno_pasta_liberada(name));

notify pgrst, 'reload schema';
