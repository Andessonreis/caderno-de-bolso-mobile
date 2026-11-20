// Funções que tocam o aparelho: câmera, arquivos, PDF, compartilhar e vibração.
// Tudo funciona sem internet.

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { isRelativePhotoPath } from './photos';

export class UserFacingError extends Error {}

function photosDir(folder: 'anotacoes' | 'caderno'): Directory {
  const dir = new Directory(Paths.document, 'fotos', folder);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function extensionOf(uri: string): string {
  const m = /\.(jpe?g|png|heic|webp)(\?|$)/i.exec(uri);
  return m ? m[1].toLowerCase() : 'jpg';
}

/**
 * Abre a câmera ou a galeria e guarda a foto na pasta do app.
 * Retorna o caminho relativo da cópia ("pasta/arquivo"), ou null se a pessoa desistiu.
 */
export async function takePhoto(source: 'camera' | 'galeria', folder: 'anotacoes' | 'caderno'): Promise<string | null> {
  if (Platform.OS === 'web') throw new UserFacingError('Fotos só funcionam no celular.');
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new UserFacingError(
      source === 'camera'
        ? 'Para tirar foto, o app precisa da permissão da câmera. Libere nas configurações do celular.'
        : 'Para escolher foto, o app precisa da permissão das fotos. Libere nas configurações do celular.',
    );
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  const name = `${Date.now()}.${extensionOf(asset.uri)}`;
  await new File(asset.uri).copy(new File(photosDir(folder), name));
  return `${folder}/${name}`;
}

function photoFile(relative: string): File | null {
  if (!isRelativePhotoPath(relative)) return null;
  const [folder, name] = relative.split('/');
  return new File(Paths.document, 'fotos', folder, name);
}

/** Endereço para mostrar a foto, montado a partir do caminho relativo salvo. */
export function photoUri(relative: string | undefined): string | undefined {
  if (!relative || Platform.OS === 'web') return undefined;
  return photoFile(relative)?.uri;
}

/** A foto existe neste aparelho? */
export function photoExists(relative: string): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return photoFile(relative)?.exists ?? false;
  } catch {
    return false;
  }
}

/** Apaga a foto guardada pelo app. Ignora se ela já não existir. */
export function deletePhotoFile(relative: string | undefined): void {
  if (!relative || Platform.OS === 'web') return;
  try {
    const f = photoFile(relative);
    if (f?.exists) f.delete();
  } catch {
    // A foto pode ter sido apagada fora do app; não há o que fazer.
  }
}

async function shareFile(file: File, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new UserFacingError('Este aparelho não permite compartilhar arquivos.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/** Gera o PDF e abre o "compartilhar" (WhatsApp, salvar, imprimir...). */
export async function sharePdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, `${fileName}.pdf`);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await shareFile(target, 'application/pdf', 'Compartilhar PDF');
}

/** Abre a tela de impressão do aparelho. */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

/** Salva o texto num arquivo .json e abre o compartilhar. */
export async function shareJson(text: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') throw new UserFacingError('Exportar só funciona no celular.');
  const file = new File(Paths.cache, `${fileName}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await shareFile(file, 'application/json', 'Guardar cópia dos dados');
}

/** Pede para escolher um arquivo e devolve o texto dele, ou null se desistiu. */
export async function pickTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  return new File(asset.uri).text();
}

export function hapticSuccess(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function hapticTap(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => undefined);
}

export function hapticWarning(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

/** Mensagem amigável para qualquer erro. */
export function errorMessage(e: unknown): string {
  if (e instanceof UserFacingError) return e.message;
  return 'Não deu certo desta vez. Tente de novo.';
}
