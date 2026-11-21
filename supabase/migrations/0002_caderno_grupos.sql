-- Caderno de Bolso: visitas reunidas por grupo.
--
-- Um grupo (núcleo, associação ou cooperativa) tem dois segredos:
--   * código do grupo: curto, para digitar no celular. Quem tem o código ENVIA
--     visitas para o grupo, mas não lê as visitas dos outros.
--   * chave da coordenação: longa, fica no link da coordenação. Quem tem a chave
--     LÊ todas as visitas do grupo.
-- O servidor guarda só o resumo (sha256) dos dois. Não há login. As tabelas não
-- têm acesso direto: tudo passa pelas funções abaixo.

create table if not exists public.caderno_grupos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 1 and 80),
  codigo_hash text not null unique,
  chave_hash  text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists public.caderno_grupo_visitas (
  grupo_id      uuid not null references public.caderno_grupos(id) on delete cascade,
  id            text not null check (char_length(id) between 1 and 64),
  dados         jsonb not null,
  atualizado_em timestamptz not null,
  apagado_em    timestamptz,
  recebido_em   timestamptz not null default now(),
  primary key (grupo_id, id)
);

alter table public.caderno_grupos        enable row level security;
alter table public.caderno_grupo_visitas enable row level security;
revoke all on public.caderno_grupos, public.caderno_grupo_visitas from anon, authenticated;

-- Deixa o código como é guardado: maiúsculas, sem espaços nem traços.
create or replace function public.caderno_grupo_codigo_limpo(p_codigo text)
returns text language sql immutable set search_path = ''
as $$ select upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public.caderno_grupo_do_codigo(p_codigo text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select g.id from public.caderno_grupos g
  where public.caderno_grupo_codigo_limpo(p_codigo) ~ '^[A-HJ-NP-Z2-9]{10}$'
    and g.codigo_hash = public.caderno_hash(public.caderno_grupo_codigo_limpo(p_codigo))
$$;

create or replace function public.caderno_grupo_chave_confere(p_grupo uuid, p_chave text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select char_length(coalesce(p_chave, '')) between 43 and 128 and exists (
    select 1 from public.caderno_grupos g
    where g.id = p_grupo and g.chave_hash = public.caderno_hash(p_chave)
  )
$$;

-- Cria o grupo. O código e a chave são gerados no aparelho de quem cria.
create or replace function public.caderno_grupo_criar(p_nome text, p_codigo text, p_chave text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_codigo text := public.caderno_grupo_codigo_limpo(p_codigo); v_nome text := btrim(coalesce(p_nome, ''));
begin
  if char_length(v_nome) not between 1 and 80 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if v_codigo !~ '^[A-HJ-NP-Z2-9]{10}$' then
    raise exception 'codigo_invalido' using errcode = '22023';
  end if;
  if p_chave is null or p_chave !~ '^[A-Za-z0-9_-]{43,128}$' then
    raise exception 'chave_invalida' using errcode = '22023';
  end if;
  begin
    insert into public.caderno_grupos (nome, codigo_hash, chave_hash)
    values (v_nome, public.caderno_hash(v_codigo), public.caderno_hash(p_chave))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'codigo_em_uso' using errcode = '23505';
  end;
  return v_id;
end $$;

-- Confere o código digitado no celular e devolve o nome do grupo.
create or replace function public.caderno_grupo_conferir(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid := public.caderno_grupo_do_codigo(p_codigo); v_nome text;
begin
  if v_id is null then
    raise exception 'grupo_nao_encontrado' using errcode = '28000';
  end if;
  select nome into v_nome from public.caderno_grupos where id = v_id;
  return jsonb_build_object('nome', v_nome);
end $$;

-- Recebe visitas de quem tem o código do grupo. Vale a alteração mais recente.
create or replace function public.caderno_grupo_enviar(p_codigo text, p_visitas jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid := public.caderno_grupo_do_codigo(p_codigo); v_v jsonb; v_total int; v_n int := 0;
begin
  if v_id is null then
    raise exception 'grupo_nao_encontrado' using errcode = '28000';
  end if;
  if jsonb_typeof(p_visitas) <> 'array' or jsonb_array_length(p_visitas) > 50 then
    raise exception 'visitas_invalidas' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 1));

  for v_v in select * from jsonb_array_elements(p_visitas) loop
    if pg_column_size(v_v) > 32768 then
      raise exception 'registro_grande_demais' using errcode = '22023';
    end if;
    insert into public.caderno_grupo_visitas as r (grupo_id, id, dados, atualizado_em, apagado_em)
    values (
      v_id, v_v->>'id', coalesce(v_v->'dados', '{}'::jsonb),
      (v_v->>'atualizado_em')::timestamptz, nullif(v_v->>'apagado_em', '')::timestamptz
    )
    on conflict (grupo_id, id) do update
      set dados = excluded.dados, atualizado_em = excluded.atualizado_em,
          apagado_em = excluded.apagado_em, recebido_em = now()
      where excluded.atualizado_em > r.atualizado_em;
    v_n := v_n + 1;
  end loop;

  select count(*) into v_total from public.caderno_grupo_visitas where grupo_id = v_id;
  if v_total > 5000 then
    raise exception 'limite_de_registros' using errcode = '54000';
  end if;

  return jsonb_build_object('recebidas', v_n);
end $$;

-- Lista as visitas do grupo para quem tem a chave da coordenação.
create or replace function public.caderno_grupo_listar(p_grupo uuid, p_chave text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_nome text; v_criado timestamptz; v_visitas jsonb;
begin
  if not public.caderno_grupo_chave_confere(p_grupo, p_chave) then
    raise exception 'chave_nao_confere' using errcode = '28000';
  end if;
  select nome, criado_em into v_nome, v_criado from public.caderno_grupos where id = p_grupo;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'dados', t.dados, 'atualizado_em', t.atualizado_em, 'recebido_em', t.recebido_em)
           order by t.atualizado_em desc), '[]'::jsonb)
    into v_visitas
  from (
    select * from public.caderno_grupo_visitas
    where grupo_id = p_grupo and apagado_em is null
    order by atualizado_em desc limit 2000
  ) t;
  return jsonb_build_object('nome', v_nome, 'criado_em', v_criado, 'visitas', v_visitas);
end $$;

-- Apaga o grupo e todas as visitas reunidas nele.
create or replace function public.caderno_grupo_apagar(p_grupo uuid, p_chave text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.caderno_grupo_chave_confere(p_grupo, p_chave) then
    raise exception 'chave_nao_confere' using errcode = '28000';
  end if;
  delete from public.caderno_grupos where id = p_grupo;
end $$;

revoke all on function public.caderno_grupo_codigo_limpo(text), public.caderno_grupo_do_codigo(text),
  public.caderno_grupo_chave_confere(uuid, text), public.caderno_grupo_criar(text, text, text),
  public.caderno_grupo_conferir(text), public.caderno_grupo_enviar(text, jsonb),
  public.caderno_grupo_listar(uuid, text), public.caderno_grupo_apagar(uuid, text) from public;
grant execute on function public.caderno_grupo_criar(text, text, text), public.caderno_grupo_conferir(text),
  public.caderno_grupo_enviar(text, jsonb), public.caderno_grupo_listar(uuid, text),
  public.caderno_grupo_apagar(uuid, text) to anon, authenticated;
