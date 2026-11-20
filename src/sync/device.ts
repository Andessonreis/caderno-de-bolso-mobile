// Peças da cópia na internet que dependem do celular: chave guardada no
// armazenamento seguro, chave aleatória e envio/recebimento de arquivos.

import * as Crypto from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { compressImage, mediaExists, mediaFileFor } from '@/lib/device';

import { SyncError, type SyncApi } from './api';
import type { CredentialStore, MediaTransport } from './engine';
import { type Credentials, isValidCredentials, keyFromBytes } from './links';
import { contentTypeFor, remoteMediaName } from './media';

const CREDENTIALS_KEY = 'caderno.credenciais';

/** A cópia na internet só existe no app do celular. */
export const SYNC_AVAILABLE = Platform.OS === 'android' || Platform.OS === 'ios';

export const credentialStore: CredentialStore & { clear(): Promise<void> } = {
  async load() {
    if (!SYNC_AVAILABLE) return null;
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isValidCredentials(parsed as Credentials) ? (parsed as Credentials) : null;
    } catch {
      return null;
    }
  },
  async save(c) {
    await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(c));
  },
  async clear() {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  },
  newKey() {
    return keyFromBytes(Crypto.getRandomBytes(32));
  },
};

function statusError(status: number, body: string): SyncError {
  if (body.includes('chave') || status === 401 || status === 403) return new SyncError('chave', `HTTP ${status}`, status);
  return new SyncError('servidor', `HTTP ${status}`, status);
}

/** Envio e recebimento de arquivos direto do disco (sem carregar o arquivo inteiro na memória). */
export function createMediaTransport(api: SyncApi): MediaTransport {
  return {
    exists: mediaExists,

    async upload(c, relative) {
      const file = mediaFileFor(relative);
      if (!file?.exists) return;
      let source = file;
      let type = contentTypeFor(relative);
      let temp: File | null = null;
      // Formato que o servidor não aceita (ex.: foto antiga em HEIC) ou foto grande: vira JPEG reduzido.
      if (!type || (type.startsWith('image/') && (file.size ?? 0) > 1_500_000)) {
        temp = new File(await compressImage(file.uri));
        source = temp;
        type = 'image/jpeg';
      }
      try {
        const res = await source.upload(api.mediaUrl(c, remoteMediaName(relative)), {
          httpMethod: 'POST',
          uploadType: UploadType.BINARY_CONTENT,
          mimeType: type,
          headers: api.mediaHeaders(c, { 'Content-Type': type, 'x-upsert': 'true' }),
        });
        if (res.status >= 300) throw statusError(res.status, res.body ?? '');
      } catch (e) {
        throw e instanceof SyncError ? e : new SyncError('rede', 'falha no envio');
      } finally {
        if (temp?.exists) temp.delete();
      }
    },

    async download(c, relative) {
      const target = mediaFileFor(relative);
      if (!target) return;
      try {
        await File.downloadFileAsync(api.mediaDownloadUrl(c, remoteMediaName(relative)), target, {
          headers: api.mediaHeaders(c),
          idempotent: true,
        });
      } catch {
        if (target.exists && (target.size ?? 0) === 0) target.delete();
        throw new SyncError('servidor', 'arquivo indisponível');
      }
    },
  };
}
