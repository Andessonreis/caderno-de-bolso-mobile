import { Redirect, Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { useApp } from '@/store';
import { colors } from '@/theme';

function tabIcon(name: IconName, active: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={focused ? active : name} size={28} color={typeof color === 'string' ? color : undefined} />;
  }
  return TabIcon;
}

/** Botão central "Anotar", maior e em destaque na barra de baixo. */
function AnotarTabButton() {
  return (
    <View style={styles.centerWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Anotar"
        accessibilityHint="Abre o passo a passo para anotar uma atividade"
        onPress={() => router.push('/anotar')}
        style={({ pressed }) => [styles.center, pressed && { backgroundColor: colors.leafPressed }]}>
        <Icon name="pencil-plus" size={30} color={colors.onLeaf} />
        <AppText variant="small" color={colors.onLeaf} style={styles.centerLabel} maxFontSizeMultiplier={1.2}>
          Anotar
        </AppText>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const hasProfile = useApp((s) => s.profile !== null);
  if (!hasProfile) return <Redirect href="/boas-vindas" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.leaf,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarAllowFontScaling: true,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: colors.paper },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen
        name="caderno"
        options={{ title: 'Caderno', tabBarIcon: tabIcon('notebook-outline', 'notebook') }}
      />
      <Tabs.Screen
        name="nova"
        options={{
          title: 'Anotar',
          tabBarButton: () => <AnotarTabButton />,
        }}
      />
      <Tabs.Screen
        name="resumos"
        options={{ title: 'Resumos', tabBarIcon: tabIcon('clipboard-text-outline', 'clipboard-text') }}
      />
      <Tabs.Screen
        name="visita"
        options={{ title: 'Visita', tabBarIcon: tabIcon('account-group-outline', 'account-group') }}
      />
      <Tabs.Screen
        name="mais"
        options={{ title: 'Mais', tabBarIcon: tabIcon('dots-horizontal-circle-outline', 'dots-horizontal-circle') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    minHeight: 72,
    paddingTop: 6,
  },
  item: { minHeight: 56 },
  label: { fontSize: 13, fontWeight: '600', maxWidth: 80 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  center: {
    marginTop: -18,
    width: 72,
    minHeight: 72,
    borderRadius: 20,
    backgroundColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  centerLabel: { fontWeight: '700', marginTop: -2 },
});
