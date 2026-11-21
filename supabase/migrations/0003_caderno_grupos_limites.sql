-- Caderno de Bolso: limites e validação do grupo das visitas.
--
--  * funções de apoio deixam de ser chamáveis de fora (só as funções da API usam);
--  * cada visita enviada é validada antes de gravar, com erro claro em vez de erro genérico;
--  * data no futuro é trazida para no máximo um dia à frente, para um relógio adiantado
--    não deixar a visita travada sem poder ser corrigida ou apagada;
--  * visita apagada não guarda mais os dados no servidor;
--  * o limite do grupo só vale quando o envio traz visita nova: corrigir e apagar
--    continuam funcionando com o grupo cheio;
--  * teto de espaço por grupo e de grupos criados por hora;
--  * a lista da coordenação informa o total, para avisar quando há mais do que mostra.

revoke execute on function public.caderno_hash(text), public.caderno_grupo_codigo_limpo(text),
  public.caderno_grupo_do_codigo(text), public.caderno_grupo_chave_confere(uuid, text)
  from public, anon, authenticated;

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
  perform pg_advisory_xact_lock(hashtextextended('caderno_grupo_criar', 2));
  if (select count(*) from public.caderno_grupos where criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'muitos_grupos_agora' using errcode = '54000';
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

create or replace function public.caderno_grupo_enviar(p_codigo text, p_visitas jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := public.caderno_grupo_do_codigo(p_codigo);
  v_v jsonb; v_vid text; v_at timestamptz; v_del timestamptz;
  v_teto timestamptz := now() + interval '1 day';
  v_n int := 0; v_novas int := 0; v_total int; v_bytes bigint;
begin
  if v_id is null then
    raise exception 'grupo_nao_encontrado' using errcode = '28000';
  end if;
  if p_visitas is null or jsonb_typeof(p_visitas) <> 'array' or jsonb_array_length(p_visitas) > 50 then
    raise exception 'visitas_invalidas' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 1));

  for v_v in select * from jsonb_array_elements(p_visitas) loop
    if pg_column_size(v_v) > 32768 then
      raise exception 'registro_grande_demais' using errcode = '22023';
    end if;
    if jsonb_typeof(v_v) <> 'object' then
      raise exception 'visitas_invalidas' using errcode = '22023';
    end if;
    v_vid := v_v->>'id';
    if v_vid is null or char_length(v_vid) not between 1 and 64
       or jsonb_typeof(coalesce(v_v->'dados', '{}'::jsonb)) <> 'object' then
      raise exception 'visitas_invalidas' using errcode = '22023';
    end if;
    begin
      v_at  := (v_v->>'atualizado_em')::timestamptz;
      v_del := nullif(v_v->>'apagado_em', '')::timestamptz;
    exception when others then
      raise exception 'visitas_invalidas' using errcode = '22023';
    end;
    if v_at is null or not isfinite(v_at) or (v_del is not null and not isfinite(v_del)) then
      raise exception 'visitas_invalidas' using errcode = '22023';
    end if;
    v_at := least(v_at, v_teto);
    -- least() ignora nulo: sem o teste, toda visita sairia marcada como apagada.
    if v_del is not null then
      v_del := least(v_del, v_teto);
    end if;

    if not exists (select 1 from public.caderno_grupo_visitas where grupo_id = v_id and id = v_vid) then
      v_novas := v_novas + 1;
    end if;

    insert into public.caderno_grupo_visitas as r (grupo_id, id, dados, atualizado_em, apagado_em)
    values (
      v_id, v_vid,
      case when v_del is null then coalesce(v_v->'dados', '{}'::jsonb) else '{}'::jsonb end,
      v_at, v_del
    )
    on conflict (grupo_id, id) do update
      set dados = excluded.dados, atualizado_em = excluded.atualizado_em,
          apagado_em = excluded.apagado_em, recebido_em = now()
      where excluded.atualizado_em > r.atualizado_em;
    v_n := v_n + 1;
  end loop;

  if v_novas > 0 then
    select count(*), coalesce(sum(pg_column_size(dados)), 0) into v_total, v_bytes
    from public.caderno_grupo_visitas where grupo_id = v_id;
    if v_total > 5000 or v_bytes > 25 * 1024 * 1024 then
      raise exception 'limite_de_registros' using errcode = '54000';
    end if;
  end if;

  return jsonb_build_object('recebidas', v_n);
end $$;

create or replace function public.caderno_grupo_listar(p_grupo uuid, p_chave text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_nome text; v_criado timestamptz; v_visitas jsonb; v_total int;
begin
  if not public.caderno_grupo_chave_confere(p_grupo, p_chave) then
    raise exception 'chave_nao_confere' using errcode = '28000';
  end if;
  select nome, criado_em into v_nome, v_criado from public.caderno_grupos where id = p_grupo;
  select count(*) into v_total from public.caderno_grupo_visitas where grupo_id = p_grupo and apagado_em is null;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'dados', t.dados, 'atualizado_em', t.atualizado_em, 'recebido_em', t.recebido_em)
           order by t.atualizado_em desc), '[]'::jsonb)
    into v_visitas
  from (
    select * from public.caderno_grupo_visitas
    where grupo_id = p_grupo and apagado_em is null
    order by atualizado_em desc limit 2000
  ) t;
  return jsonb_build_object('nome', v_nome, 'criado_em', v_criado, 'total', v_total, 'visitas', v_visitas);
end $$;

revoke all on function public.caderno_grupo_criar(text, text, text), public.caderno_grupo_enviar(text, jsonb),
  public.caderno_grupo_listar(uuid, text) from public;
grant execute on function public.caderno_grupo_criar(text, text, text), public.caderno_grupo_enviar(text, jsonb),
  public.caderno_grupo_listar(uuid, text) to anon, authenticated;
