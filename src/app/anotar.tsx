import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChoiceTile } from '@/components/ChoiceTile';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { NumberPad } from '@/components/NumberPad';
import { Screen } from '@/components/Screen';
import { StepProgress } from '@/components/StepProgress';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import {
  ACTIVITIES,
  DESTINATIONS,
  INPUTS,
  INPUT_ORIGINS,
  PURCHASE_KINDS,
  SEED_ORIGINS,
  activityInfo,
  capitalize,
  unitButtonLabel,
  unitText,
} from '@/lib/catalog';
import { addDays, formatLongDate, today as todayISO } from '@/lib/dates';
import { deleteMediaFile, errorMessage, hapticSuccess, mediaUri, takePhoto } from '@/lib/device';
import { applyEdit } from '@/lib/edit';
import { formatMoney, numberToInput, parseDecimal } from '@/lib/format';
import { describeEntry, quantityText } from '@/lib/sentence';
import type { ActivityKind, Entry, ISODate, Unit } from '@/lib/types';
import { lastUnitFor, rankByUsage } from '@/lib/usage';
import { newId, useApp, useAreas, useEntries } from '@/store';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

type Step =
  | 'area'
  | 'cultura'
  | 'atividade'
  | 'origem-semente'
  | 'insumo'
  | 'origem-insumo'
  | 'o-que-comprou'
  | 'quantidade'
  | 'valor'
  | 'destino'
  | 'revisao'
  | 'feito';

type Draft = Partial<Omit<Entry, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'copied'>>;

/** Arquivos ligados à anotação: foto e recado de voz. */
const MEDIA_KEYS = ['photo', 'audio'] as const;
type MediaRefs = Partial<Record<(typeof MEDIA_KEYS)[number], string>>;

/** Passos de detalhe de cada atividade, um assunto por tela. */
function detailSteps(activity: ActivityKind | undefined): Step[] {
  switch (activity) {
    case 'plantio':
      return ['origem-semente', 'quantidade'];
    case 'adubacao':
      return ['insumo', 'origem-insumo', 'quantidade'];
    case 'colheita':
      return ['quantidade'];
    case 'venda':
      return ['quantidade', 'valor', 'destino'];
    case 'compra':
      return ['o-que-comprou', 'quantidade', 'valor'];
    default:
      return [];
  }
}

/** Quantidade obrigatória só em colheita e venda; nas outras dá para pular. */
function quantityRequired(activity: ActivityKind | undefined): boolean {
  return activity === 'colheita' || activity === 'venda';
}

export default function Anotar() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const areas = useAreas();
  const crops = useApp((s) => s.crops);
  const entries = useEntries();
  const cropUsage = useApp((s) => s.cropUsage);
  const lastAreaId = useApp((s) => s.lastAreaId);
  const addEntry = useApp((s) => s.addEntry);
  const updateEntry = useApp((s) => s.updateEntry);
  const deleteEntry = useApp((s) => s.deleteEntry);
  const setCrops = useApp((s) => s.setCrops);

  // Cópia da anotação como estava ao abrir, para "Desfazer" uma edição.
  const [editing] = useState(() => (id ? useApp.getState().entries.find((e) => e.id === id && !e.deletedAt) : undefined));
  const isEdit = Boolean(editing);
  const today = todayISO();

  const singleArea = areas.length === 1 ? areas[0].id : undefined;
  const [draft, setDraft] = useState<Draft>(() => {
    if (editing) return { ...editing };
    return { date: today, areaId: singleArea };
  });
  const [step, setStep] = useState<Step>(() => (editing ? 'revisao' : singleArea ? 'cultura' : 'area'));
  /** Quando editando, cada escolha volta direto para a revisão. */
  const [returnToReview, setReturnToReview] = useState(isEdit);
  const [qtyText, setQtyText] = useState(numberToInput(editing?.quantity));
  const [valueText, setValueText] = useState(numberToInput(editing?.value));
  const [savedId, setSavedId] = useState<string | null>(null);
  const [otherCrop, setOtherCrop] = useState('');
  const [pickingDay, setPickingDay] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reopened, setReopened] = useState(false);
  /** Foto da anotação ao abrir a tela (edição). Só é apagada depois de confirmada a troca. */
  const original = useRef<MediaRefs>({ photo: editing?.photo, audio: editing?.audio });
  /** Foto que ficou salva na última gravação. */
  const saved = useRef<MediaRefs>({});

  const flow: Step[] = useMemo(() => {
    const base: Step[] = singleArea && !isEdit ? [] : ['area'];
    return [...base, 'cultura', 'atividade', ...detailSteps(draft.activity), 'revisao'];
  }, [singleArea, isEdit, draft.activity]);

  const stepIndex = flow.indexOf(step);

  const goNext = (from: Step, nextDraft: Draft = draft) => {
    if (returnToReview) {
      // Ao mudar a atividade na edição, os detalhes novos precisam ser preenchidos.
      if (from === 'atividade') {
        const details = detailSteps(nextDraft.activity);
        if (details.length) {
          setStep(details[0]);
          return;
        }
      }
      const details = detailSteps(nextDraft.activity);
      const i = details.indexOf(from);
      if (i >= 0 && i < details.length - 1) {
        setStep(details[i + 1]);
        return;
      }
      setStep('revisao');
      return;
    }
    const newFlow: Step[] = [
      ...(singleArea && !isEdit ? [] : (['area'] as Step[])),
      'cultura',
      'atividade',
      ...detailSteps(nextDraft.activity),
      'revisao',
    ];
    const i = newFlow.indexOf(from);
    setStep(newFlow[i + 1] ?? 'revisao');
  };

  const navigateAway = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const leave = () => {
    for (const k of MEDIA_KEYS) {
      const before = original.current[k];
      if (savedId) {
        // Saiu da tela "feito" sem desfazer: a troca de foto ou recado está confirmada.
        if (isEdit && before && before !== saved.current[k]) deleteMediaFile(before);
      } else if (draft[k] && draft[k] !== before) {
        // Foto ou recado feito e não salvo: apaga para não ocupar espaço.
        deleteMediaFile(draft[k]);
      }
    }
    navigateAway();
  };

  const goBack = () => {
    if (step === 'feito') return leave();
    if (step === 'revisao' && isEdit) return leave();
    if (returnToReview && step !== 'revisao') return setStep('revisao');
    if (stepIndex <= 0) return leave();
    setStep(flow[stepIndex - 1]);
  };

  // Botão "voltar" do Android volta um passo, em vez de sair do fluxo.
  const goBackRef = useRef(goBack);
  useEffect(() => {
    goBackRef.current = goBack;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const set = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));

  const areaName = areas.find((a) => a.id === draft.areaId)?.name ?? '';

  const buildEntry = (): Entry | null => {
    if (!draft.areaId || !draft.crop || !draft.activity || !draft.date) return null;
    const info = activityInfo(draft.activity);
    const qty = info.units.length ? parseDecimal(qtyText) : undefined;
    const value = draft.activity === 'venda' || draft.activity === 'compra' ? parseDecimal(valueText) : undefined;
    const e: Entry = {
      id: editing?.id ?? newId(),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      copied: editing?.copied ?? false,
      exemplo: editing?.exemplo,
      date: draft.date,
      areaId: draft.areaId,
      crop: draft.crop,
      activity: draft.activity,
      quantity: qty,
      unit: qty !== undefined ? draft.unit ?? info.units[0] : undefined,
      note: draft.note?.trim() || undefined,
      updatedAt: new Date().toISOString(),
      photo: draft.photo,
      audio: draft.audio,
      audioSeconds: draft.audio ? draft.audioSeconds : undefined,
    };
    if (draft.activity === 'plantio') {
      e.variety = draft.variety?.trim() || undefined;
      e.seedOrigin = draft.seedOrigin;
    }
    if (draft.activity === 'adubacao') {
      e.input = draft.input;
      e.inputOrigin = draft.inputOrigin;
    }
    if (draft.activity === 'venda') {
      e.value = value;
      e.destination = draft.destination;
    }
    if (draft.activity === 'compra') {
      e.purchaseKind = draft.purchaseKind;
      e.value = value;
    }
    return e;
  };

  const preview = buildEntry();

  const save = () => {
    const e = buildEntry();
    if (!e) return;
    if (isEdit && editing) {
      const edited = applyEdit(editing, e);
      updateEntry(edited.entry);
      setReopened(edited.reopened);
    } else {
      addEntry(e);
    }
    hapticSuccess();
    saved.current = { photo: e.photo, audio: e.audio };
    setSavedId(e.id);
    setStep('feito');
  };

  const undo = () => {
    if (!savedId) return;
    if (isEdit) {
      // Desfazer edição: volta a anotação como estava (com a foto e o recado
      // originais, que ainda não foram apagados) e descarta os novos.
      if (editing) updateEntry(editing);
      for (const k of MEDIA_KEYS) {
        const now = saved.current[k];
        if (now && now !== original.current[k]) deleteMediaFile(now);
      }
      navigateAway();
      return;
    }
    deleteEntry(savedId);
    setSavedId(null);
    setStep('revisao');
  };

  const startAnother = () => {
    setDraft({ date: today, areaId: draft.areaId });
    setQtyText('');
    setValueText('');
    setSavedId(null);
    setPickingDay(false);
    setReturnToReview(false);
    setStep('cultura');
  };

  const addPhoto = async (source: 'camera' | 'galeria') => {
    setPhotoBusy(true);
    try {
      const file = await takePhoto(source, 'anotacoes');
      if (file) {
        if (draft.photo && draft.photo !== original.current.photo) deleteMediaFile(draft.photo);
        set({ photo: file });
      }
    } catch (err) {
      Alert.alert('Foto', errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = () => {
    if (draft.photo && draft.photo !== original.current.photo) deleteMediaFile(draft.photo);
    set({ photo: undefined });
  };

  const setAudio = (file: string, seconds: number) => {
    if (draft.audio && draft.audio !== original.current.audio) deleteMediaFile(draft.audio);
    set({ audio: file, audioSeconds: seconds });
  };

  const removeAudio = () => {
    if (draft.audio && draft.audio !== original.current.audio) deleteMediaFile(draft.audio);
    set({ audio: undefined, audioSeconds: undefined });
  };

  const progress =
    step === 'feito' ? null : <StepProgress step={Math.max(1, stepIndex + 1)} total={flow.length} />;

  const common = {
    back: true,
    onBack: goBack,
    backLabel: (stepIndex <= 0 && !returnToReview) || (isEdit && step === 'revisao') ? 'Sair' : 'Voltar',
    top: progress,
  };

  // ---------- Telas ----------

  if (step === 'area') {
    const ordered = [...areas].sort((a, b) => (a.id === lastAreaId ? -1 : b.id === lastAreaId ? 1 : 0));
    return (
      <Screen {...common} title="Onde foi?" subtitle="Toque na área da roça.">
        <View style={styles.list}>
          {ordered.map((a) => (
            <ChoiceTile
              key={a.id}
              label={a.name}
              icon="map-marker-outline"
              selected={draft.areaId === a.id}
              badge={a.id === lastAreaId ? 'Última usada' : undefined}
              onPress={() => {
                const next = { ...draft, areaId: a.id };
                setDraft(next);
                goNext('area', next);
              }}
            />
          ))}
        </View>
        {areas.length === 0 ? (
          <AppText variant="body" color={colors.inkMuted}>
            Nenhuma área cadastrada. Cadastre em Mais &gt; Áreas e culturas.
          </AppText>
        ) : null}
      </Screen>
    );
  }

  if (step === 'cultura') {
    const ranked = rankByUsage(crops, cropUsage);
    const addOther = () => {
      const v = otherCrop.trim().toLowerCase().slice(0, 30);
      if (!v) return;
      if (!crops.includes(v)) setCrops([...crops, v]);
      setOtherCrop('');
      const next = { ...draft, crop: v };
      setDraft(next);
      goNext('cultura', next);
    };
    return (
      <Screen {...common} title="Qual cultura?" subtitle={areaName ? `Área: ${areaName}` : undefined}>
        <View style={styles.grid}>
          {ranked.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={capitalize(c)}
              accessibilityState={{ selected: draft.crop === c }}
              onPress={() => {
                const next = { ...draft, crop: c };
                setDraft(next);
                goNext('cultura', next);
              }}
              style={({ pressed }) => [
                styles.gridTile,
                draft.crop === c && styles.gridTileOn,
                pressed && { backgroundColor: colors.surfaceSunk },
              ]}>
              <Icon name="sprout-outline" size={30} color={colors.leaf} />
              <AppText variant="bodyStrong" center>
                {capitalize(c)}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View style={styles.other}>
          <Field
            label="Não está na lista?"
            placeholder="Nome da cultura"
            value={otherCrop}
            onChangeText={setOtherCrop}
            onSubmitEditing={addOther}
            returnKeyType="done"
            maxLength={30}
          />
          <Button label="Usar esta cultura" variant="secondary" icon="plus" disabled={!otherCrop.trim()} onPress={addOther} />
        </View>
      </Screen>
    );
  }

  if (step === 'atividade') {
    return (
      <Screen {...common} title="O que você fez?" subtitle={draft.crop ? `${capitalize(draft.crop)} · ${areaName}` : undefined}>
        <View style={styles.grid}>
          {ACTIVITIES.map((a) => (
            <Pressable
              key={a.kind}
              accessibilityRole="radio"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: draft.activity === a.kind }}
              onPress={() => {
                const next: Draft = { ...draft, activity: a.kind };
                if (draft.activity !== a.kind) {
                  next.unit = draft.crop ? lastUnitFor(entries, draft.crop, a.kind) : undefined;
                }
                setDraft(next);
                goNext('atividade', next);
              }}
              style={({ pressed }) => [
                styles.gridTile,
                draft.activity === a.kind && styles.gridTileOn,
                pressed && { backgroundColor: colors.surfaceSunk },
              ]}>
              <Icon name={a.icon} size={36} color={colors.leaf} />
              <AppText variant="bodyStrong" center>
                {a.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 'origem-semente') {
    return (
      <Screen
        {...common}
        title="De onde veio a semente?"
        subtitle="A visita confere a origem da semente, principalmente de milho e feijão."
        footer={<Button label="Não sei agora, pular" variant="quiet" onPress={() => goNext('origem-semente')} />}>
        <View style={styles.list}>
          {SEED_ORIGINS.map((o) => (
            <ChoiceTile
              key={o.value}
              label={o.label}
              icon="seed-outline"
              selected={draft.seedOrigin === o.value}
              onPress={() => {
                const next = { ...draft, seedOrigin: o.value };
                setDraft(next);
                goNext('origem-semente', next);
              }}
            />
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 'insumo') {
    return (
      <Screen {...common} title="O que usou?">
        <View style={styles.list}>
          {INPUTS.map((o) => (
            <ChoiceTile
              key={o.value}
              label={o.label}
              icon="flask-outline"
              selected={draft.input === o.value}
              onPress={() => {
                const next = { ...draft, input: o.value };
                setDraft(next);
                goNext('insumo', next);
              }}
            />
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 'origem-insumo') {
    return (
      <Screen {...common} title="De onde veio?">
        <View style={styles.list}>
          {INPUT_ORIGINS.map((o) => (
            <ChoiceTile
              key={o.value}
              label={o.label}
              icon={o.value === 'proprio' ? 'barn' : 'store-outline'}
              selected={draft.inputOrigin === o.value}
              onPress={() => {
                const next = { ...draft, inputOrigin: o.value };
                setDraft(next);
                goNext('origem-insumo', next);
              }}
            />
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 'o-que-comprou') {
    return (
      <Screen {...common} title="O que comprou?">
        <View style={styles.list}>
          {PURCHASE_KINDS.map((o) => (
            <ChoiceTile
              key={o.value}
              label={o.label}
              icon={o.value === 'semente' ? 'seed-outline' : 'flask-outline'}
              selected={draft.purchaseKind === o.value}
              onPress={() => {
                const next = { ...draft, purchaseKind: o.value };
                setDraft(next);
                goNext('o-que-comprou', next);
              }}
            />
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 'quantidade' && draft.activity) {
    const info = activityInfo(draft.activity);
    const unit: Unit = draft.unit && info.units.includes(draft.unit) ? draft.unit : info.units[0];
    const required = quantityRequired(draft.activity);
    const valid = parseDecimal(qtyText) !== undefined;
    return (
      <Screen
        {...common}
        title="Quanto?"
        subtitle={`${info.label} de ${draft.crop}`}
        footer={
          <View style={styles.footerRow}>
            {!required ? (
              <Button
                label="Pular"
                variant="secondary"
                style={styles.flex}
                onPress={() => {
                  setQtyText('');
                  goNext('quantidade');
                }}
              />
            ) : null}
            <Button
              label="Próximo"
              icon="arrow-right"
              size="xl"
              style={styles.flex2}
              disabled={!valid}
              onPress={() => {
                const next = { ...draft, unit };
                setDraft(next);
                goNext('quantidade', next);
              }}
            />
          </View>
        }>
        <View style={styles.units} accessibilityRole="radiogroup" accessibilityLabel="Unidade">
          {info.units.map((u) => (
            <Pressable
              key={u}
              accessibilityRole="radio"
              accessibilityLabel={unitButtonLabel(u)}
              accessibilityState={{ selected: u === unit }}
              onPress={() => set({ unit: u })}
              style={({ pressed }) => [
                styles.unit,
                u === unit && styles.unitOn,
                pressed && u !== unit && { backgroundColor: colors.surfaceSunk },
              ]}>
              <AppText variant="label" color={u === unit ? colors.onLeaf : colors.ink}>
                {unitButtonLabel(u)}
              </AppText>
            </Pressable>
          ))}
        </View>
        <NumberPad label="Quantidade" value={qtyText} onChange={setQtyText} suffix={unitText(unit, parseDecimal(qtyText) ?? 0)} />
      </Screen>
    );
  }

  if (step === 'valor') {
    const typed = valueText.length > 0;
    const valid = parseDecimal(valueText) !== undefined;
    return (
      <Screen
        {...common}
        title={draft.activity === 'compra' ? 'Quanto pagou?' : 'Quanto recebeu?'}
        subtitle="Se não quiser anotar o valor, toque em Pular."
        footer={
          <View style={styles.footerRow}>
            <Button
              label="Pular"
              variant="secondary"
              style={styles.flex}
              onPress={() => {
                setValueText('');
                goNext('valor');
              }}
            />
            <Button
              label="Próximo"
              icon="arrow-right"
              size="xl"
              style={styles.flex2}
              disabled={!typed || !valid}
              onPress={() => goNext('valor')}
            />
          </View>
        }>
        <NumberPad label="Valor em reais" value={valueText} onChange={setValueText} prefix="R$" />
      </Screen>
    );
  }

  if (step === 'destino') {
    return (
      <Screen
        {...common}
        title="Vendeu para onde?"
        footer={<Button label="Pular" variant="quiet" onPress={() => goNext('destino')} />}>
        <View style={styles.list}>
          {DESTINATIONS.map((o) => (
            <ChoiceTile
              key={o.value}
              label={o.label}
              icon="storefront-outline"
              selected={draft.destination === o.value}
              onPress={() => {
                const next = { ...draft, destination: o.value };
                setDraft(next);
                goNext('destino', next);
              }}
            />
          ))}
        </View>
      </Screen>
    );
  }

  if (step === 'feito' && preview) {
    return (
      <Screen
        footer={
          <>
            {isEdit ? (
              <Button label="Voltar ao caderno" icon="notebook-outline" size="xl" onPress={leave} />
            ) : (
              <>
                <Button label="Anotar outra" icon="pencil-plus" size="xl" onPress={startAnother} />
                <Button label="Voltar ao início" variant="secondary" icon="home-outline" onPress={() => router.replace('/')} />
              </>
            )}
            <Button label="Desfazer" variant="quiet" icon="undo" onPress={undo} />
          </>
        }>
        <View style={styles.done} accessibilityLiveRegion="polite">
          <View style={styles.doneIcon}>
            <Icon name="check-bold" size={64} color={colors.onLeaf} />
          </View>
          <AppText variant="display" center>
            {isEdit ? 'Alteração salva!' : 'Anotado!'}
          </AppText>
          <AppText variant="body" center>
            {describeEntry(preview, areaName, today)}
          </AppText>
          {reopened ? (
            <AppText variant="bodyStrong" color={colors.clay} center>
              Como você mudou a anotação, ela voltou para &quot;falta passar para o caderno&quot;.
            </AppText>
          ) : null}
          <AppText variant="small" color={colors.inkMuted} center>
            Depois é só passar para o caderno de papel. O resumo da semana mostra tudo em ordem.
          </AppText>
        </View>
      </Screen>
    );
  }

  // ---------- Revisão ----------
  const editRow = (label: string, value: string, to: Step) => (
    <Pressable
      key={to}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Toque para mudar`}
      onPress={() => {
        setReturnToReview(true);
        setStep(to);
      }}
      style={({ pressed }) => [styles.editRow, pressed && { backgroundColor: colors.surfaceSunk }]}>
      <View style={styles.flex}>
        <AppText variant="small" color={colors.inkMuted}>
          {label}
        </AppText>
        <AppText variant="bodyStrong">{value}</AppText>
      </View>
      <AppText variant="label" color={colors.leaf}>
        Mudar
      </AppText>
    </Pressable>
  );

  const dayChoices: { label: string; date: ISODate }[] = [
    { label: 'Hoje', date: today },
    { label: 'Ontem', date: addDays(today, -1) },
  ];
  const day = draft.date ?? today;
  const isOtherDay = day !== today && day !== addDays(today, -1);
  const details = detailSteps(draft.activity);
  const firstDetail = details[0];
  const detailSummary = preview
    ? [
        quantityText(preview),
        preview.value !== undefined ? formatMoney(preview.value) : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'Sem quantidade'
    : '';

  return (
    <Screen
      {...common}
      title={isEdit ? 'Mudar anotação' : 'Confira e salve'}
      footer={
        <Button
          label={isEdit ? 'Salvar alteração' : 'Salvar anotação'}
          icon="content-save"
          size="xl"
          disabled={!preview || (quantityRequired(draft.activity) && preview.quantity === undefined)}
          onPress={save}
        />
      }>
      {preview ? (
        <View style={styles.sentence} accessibilityLiveRegion="polite">
          <AppText variant="heading">{describeEntry(preview, areaName, today)}</AppText>
        </View>
      ) : null}

      <View style={styles.block}>
        <AppText variant="label">Quando foi?</AppText>
        <View style={styles.footerRow}>
          {dayChoices.map((d) => (
            <Pressable
              key={d.label}
              accessibilityRole="radio"
              accessibilityLabel={d.label}
              accessibilityState={{ selected: draft.date === d.date && !pickingDay }}
              onPress={() => {
                setPickingDay(false);
                set({ date: d.date });
              }}
              style={[styles.day, draft.date === d.date && styles.dayOn]}>
              <AppText variant="label" color={draft.date === d.date ? colors.onLeaf : colors.ink}>
                {d.label}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel="Outro dia"
            accessibilityState={{ selected: isOtherDay || pickingDay }}
            onPress={() => {
              setPickingDay(true);
              if (!isOtherDay) set({ date: addDays(today, -2) });
            }}
            style={[styles.day, (isOtherDay || pickingDay) && styles.dayOn]}>
            <AppText variant="label" color={isOtherDay || pickingDay ? colors.onLeaf : colors.ink}>
              Outro dia
            </AppText>
          </Pressable>
        </View>
        {pickingDay || isOtherDay ? (
          <View style={styles.dayStepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Um dia antes"
              onPress={() => set({ date: addDays(day, -1) })}
              style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: colors.surfaceSunk }]}>
              <Icon name="chevron-left" size={34} color={colors.leaf} />
            </Pressable>
            <AppText variant="bodyStrong" center style={styles.flex}>
              {formatLongDate(day)}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Um dia depois"
              accessibilityState={{ disabled: day >= today }}
              disabled={day >= today}
              onPress={() => set({ date: addDays(day, 1) })}
              style={({ pressed }) => [
                styles.stepBtn,
                day >= today && { opacity: 0.35 },
                pressed && { backgroundColor: colors.surfaceSunk },
              ]}>
              <Icon name="chevron-right" size={34} color={colors.leaf} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.block}>
        {editRow('Área', areaName || 'Escolher', 'area')}
        {editRow('Cultura', draft.crop ? capitalize(draft.crop) : 'Escolher', 'cultura')}
        {editRow('O que fez', draft.activity ? activityInfo(draft.activity).label : 'Escolher', 'atividade')}
        {firstDetail ? editRow('Detalhes', detailSummary, firstDetail) : null}
      </View>

      {draft.activity === 'plantio' ? (
        <Field
          label="Variedade"
          optional
          placeholder="Ex.: Palha roxa"
          value={draft.variety ?? ''}
          onChangeText={(variety) => set({ variety })}
          maxLength={40}
        />
      ) : null}

      <Field
        label="Observação"
        optional
        placeholder="Algo curto, se precisar"
        value={draft.note ?? ''}
        onChangeText={(note) => set({ note })}
        maxLength={120}
      />

      <View style={styles.block}>
        <AppText variant="label">Recado de voz (se quiser)</AppText>
        <VoiceRecorder value={draft.audio} seconds={draft.audioSeconds} onRecorded={setAudio} onRemove={removeAudio} />
      </View>

      <View style={styles.block}>
        <AppText variant="label">Foto (se quiser)</AppText>
        {draft.photo ? (
          <View style={styles.photoRow}>
            <Image source={{ uri: mediaUri(draft.photo) }} style={styles.thumb} contentFit="cover" accessibilityLabel="Foto da anotação" />
            <Button label="Tirar a foto" variant="danger" icon="close" style={styles.flex} onPress={removePhoto} />
          </View>
        ) : (
          <View style={styles.footerRow}>
            <Button
              label="Câmera"
              icon="camera-outline"
              variant="secondary"
              style={styles.flex}
              busy={photoBusy}
              onPress={() => addPhoto('camera')}
            />
            <Button
              label="Galeria"
              icon="image-outline"
              variant="secondary"
              style={styles.flex}
              disabled={photoBusy}
              onPress={() => addPhoto('galeria')}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridTile: {
    width: '48.5%',
    flexGrow: 1,
    minHeight: 104,
    padding: space.md,
    gap: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  gridTileOn: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  other: { gap: space.sm, marginTop: space.sm },
  footerRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  unit: {
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  unitOn: { backgroundColor: colors.leaf },
  sentence: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.leafSoft,
    borderLeftWidth: 6,
    borderLeftColor: colors.leaf,
  },
  block: { gap: space.sm },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_MIN + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  day: {
    flexGrow: 1,
    minWidth: 90,
    minHeight: TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  dayOn: { backgroundColor: colors.leaf },
  dayStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  stepBtn: {
    width: TOUCH_MIN,
    height: TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceSunk },
  done: { alignItems: 'center', gap: space.lg, marginTop: space.xxl },
  doneIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
