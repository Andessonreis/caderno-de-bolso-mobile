import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

/** Endereço que não existe no app. */
export default function NaoEncontrada() {
  return (
    <Screen title="Página não encontrada">
      <EmptyState
        icon="map-marker-question-outline"
        title="Essa tela não existe"
        text="O endereço aberto não é de nenhuma tela do Caderno de Bolso. Suas anotações continuam guardadas."
      />
      <Button label="Voltar para o início" icon="home-outline" size="xl" onPress={() => router.replace('/')} />
    </Screen>
  );
}
