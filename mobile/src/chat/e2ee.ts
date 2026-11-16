// End-to-end encryption for 1:1 Hush text: NaCl box (X25519 + XSalsa20-Poly1305) via tweetnacl.
// Private key never leaves the device (SecureStore). The server only stores public keys and ciphertext.
// Honest scope: per-message box encryption, no forward secrecy yet (Signal double-ratchet is the upgrade path); groups not yet.
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { call, useSession } from '../lib/api';
import { feature } from '../lib/config';

const KEY = (id: string) => `vibeloop.e2ee.${id.replace(/[^\w.-]/g, '_')}`;
const store = { get: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)), set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)) };
let mine: nacl.BoxKeyPair | null = null; const peerKeys = new Map<string, string>();
const deviceId = () => `${Platform.OS}-${useSession.getState().activeId}`;

/** Create (once) and publish this device's public key. */
export async function ensureKeys() {
  const id = useSession.getState().activeId; if (!id || !feature('e2ee')) return null;
  const raw = await store.get(KEY(id));
  if (raw) { const j = JSON.parse(raw); mine = { publicKey: decodeBase64(j.pk), secretKey: decodeBase64(j.sk) }; }
  else { mine = nacl.box.keyPair(); await store.set(KEY(id), JSON.stringify({ pk: encodeBase64(mine.publicKey), sk: encodeBase64(mine.secretKey) })); }
  call('PUT', '/keys', { publicKey: encodeBase64(mine.publicKey), deviceId: deviceId() }).catch(() => {});
  return encodeBase64(mine.publicKey);
}
async function peerKey(userId: string) {
  if (peerKeys.has(userId)) return peerKeys.get(userId)!;
  const r = await call<any>('GET', `/users/${userId}/keys`); const k = Array.isArray(r) ? r[0]?.publicKey : r?.keys?.[0]?.publicKey ?? r?.publicKey;
  if (!k) throw new Error('They haven’t set up encryption yet'); peerKeys.set(userId, k); return k;
}
export async function encryptFor(userId: string, text: string) {
  if (!mine) await ensureKeys(); if (!mine) throw new Error('Encryption is off');
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(decodeUTF8(text), nonce, decodeBase64(await peerKey(userId)), mine.secretKey);
  return { v: 1, nonce: encodeBase64(nonce), box: encodeBase64(box), senderKey: encodeBase64(mine.publicKey) };
}
/** Decrypt a message box. Works for both sides (NaCl box shares one key between the pair). */
export async function decrypt(enc: { nonce: string; box: string; senderKey: string }, otherUserId: string, fromMe: boolean): Promise<string | null> {
  try {
    if (!mine) await ensureKeys(); if (!mine) return null;
    const other = fromMe ? await peerKey(otherUserId) : enc.senderKey;
    const out = nacl.box.open(decodeBase64(enc.box), decodeBase64(enc.nonce), decodeBase64(other), mine.secretKey);
    return out ? encodeUTF8(out) : null;
  } catch { return null; }
}
export const fingerprint = (pk?: string | null) => (pk ? pk.replace(/[^A-Za-z0-9]/g, '').slice(0, 24).match(/.{1,4}/g)!.join(' ') : '—');
export const myPublicKey = () => (mine ? encodeBase64(mine.publicKey) : null);
