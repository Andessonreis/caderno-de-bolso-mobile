// Funções que tocam o aparelho: câmera, arquivos, PDF, compartilhar e vibração.
// Tudo funciona sem internet.

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { type MediaFile, buildArchive, bytesToText, isZip, mediaPathsOf, readArchive } from './archive';
import { type BackupData, type ImportResult, parseBackup } from './backup';
import { type MediaFolder, isRelativeMediaPath, mediaFolderOf } from './media';

export class UserFacingError extends Error {}

function mediaDir(folder: MediaFolder): Directory {
  const dir =
    folder === 'audios' ? new Directory(Paths.document, 'audios') : new Directory(Paths.document, 'fotos', folder);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** Garante a pasta e devolve o arquivo de um caminho relativo (ou null se o caminho for inválido). */
export function mediaFileFor(relative: string): File | null {
  const f = mediaFile(relative);
  if (f) mediaDir(mediaFolderOf(relative));
  return f;
}

/** Nome novo e único para um arquivo de mídia. */
function newMediaName(ext: string): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

/** Lado maior das fotos guardadas e enviadas (cabe bem em sinal fraco). */
export const PHOTO_MAX_SIDE = 1600;

/**
 * Reduz e converte a imagem para JPEG (lado maior até 1600 px, qualidade 0,7).
 * Devolve o endereço de um arquivo temporário.
 */
export async function compressImage(uri: string, width?: number, height?: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > PHOTO_MAX_SIDE) {
    ctx.resize(width >= height ? { width: PHOTO_MAX_SIDE, height: null } : { width: null, height: PHOTO_MAX_SIDE });
  } else if (!width || !height) {
    ctx.resize({ width: PHOTO_MAX_SIDE, height: null });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return result.uri;
}

function mediaFile(relative: string): File | null {
  if (!isRelativeMediaPath(relative)) return null;
  const [folder, name] = relative.split('/');
  return folder === 'audios' ? new File(Paths.document, 'audios', name) : new File(Paths.document, 'fotos', folder, name);
}

function extensionOf(uri: string, fallback: string): string {
  const m = /\.([a-z0-9]{2,5})(\?|$)/i.exec(uri);
  return m ? m[1].toLowerCase() : fallback;
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
  const name = newMediaName('jpg');
  const compressed = new File(await compressImage(asset.uri, asset.width, asset.height));
  await compressed.copy(new File(mediaDir(folder), name));
  try {
    compressed.delete();
  } catch {
    // Arquivo temporário; o sistema limpa depois.
  }
  return `${folder}/${name}`;
}

/**
 * Move a gravação recém-feita (que o gravador deixa numa pasta temporária)
 * para a pasta de recados do app. Retorna o caminho relativo ("audios/arquivo").
 */
export async function saveRecording(tempUri: string): Promise<string> {
  const name = newMediaName(extensionOf(tempUri, 'm4a'));
  const source = new File(tempUri);
  await source.copy(new File(mediaDir('audios'), name));
  try {
    source.delete();
  } catch {
    // O arquivo temporário some sozinho com o tempo.
  }
  return `audios/${name}`;
}

/** Endereço para mostrar a foto ou tocar o áudio, montado a partir do caminho relativo salvo. */
export function mediaUri(relative: string | undefined): string | undefined {
  if (!relative || Platform.OS === 'web') return undefined;
  return mediaFile(relative)?.uri;
}

/** O arquivo existe neste aparelho? */
export function mediaExists(relative: string): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return mediaFile(relative)?.exists ?? false;
  } catch {
    return false;
  }
}

/** Apaga a foto ou o áudio guardado pelo app. Ignora se já não existir. */
export function deleteMediaFile(relative: string | undefined): void {
  if (!relative || Platform.OS === 'web') return;
  try {
    const f = mediaFile(relative);
    if (f?.exists) f.delete();
  } catch {
    // O arquivo pode ter sido apagado fora do app; não há o que fazer.
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

/**
 * Gera um único arquivo .zip com os dados, as fotos e os recados de voz e abre
 * o compartilhar. Retorna quantos arquivos de mídia foram junto.
 */
export async function exportBackup(data: BackupData, fileName: string): Promise<number> {
  if (Platform.OS === 'web') throw new UserFacingError('Exportar só funciona no celular.');
  const media: MediaFile[] = [];
  for (const path of mediaPathsOf(data)) {
    const f = mediaFile(path);
    if (f?.exists) media.push({ path, bytes: await f.bytes() });
  }
  const zip = buildArchive(data, media);
  const file = new File(Paths.cache, `${fileName}.zip`);
  if (file.exists) file.delete();
  file.create();
  await file.write(zip);
  await shareFile(file, 'application/zip', 'Guardar cópia de segurança');
  return media.length;
}

async function pickBytes(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/json', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (Platform.OS === 'web' && asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  return new File(asset.uri).bytes();
}

/**
 * Escolhe um arquivo de cópia (.zip, ou .json antigo), confere tudo e só então
 * grava fotos e áudios na pasta do app. Retorna null se a pessoa desistiu.
 * Os dados conferidos voltam para quem chamou trocar o estado do app.
 */
export async function importBackup(): Promise<ImportResult | null> {
  if (Platform.OS === 'web') throw new UserFacingError('Importar só funciona no celular.');
  const bytes = await pickBytes();
  if (!bytes) return null;
  if (!isZip(bytes)) return parseBackup(bytesToText(bytes), mediaExists);

  const content = readArchive(bytes);
  if (!content) return { ok: false, error: 'O arquivo .zip não é uma cópia do Caderno de Bolso.' };
  const inArchive = new Set(content.media.map((m) => m.path));
  const result = parseBackup(content.json, (p) => inArchive.has(p) || mediaExists(p));
  if (!result.ok) return result;
  for (const m of content.media) {
    const target = mediaFile(m.path);
    if (!target) continue;
    mediaDir(mediaFolderOf(m.path));
    if (target.exists) target.delete();
    target.create();
    await target.write(m.bytes);
  }
  return result;
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
