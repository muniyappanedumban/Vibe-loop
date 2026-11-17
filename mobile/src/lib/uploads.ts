// Resumable chunked uploads (up to 1 GB) to POST /uploads → PUT chunk → complete. Survives app restarts via the outbox.
import { Platform } from 'react-native';
import { call, useSession, ApiError } from './api';

export type UploadFile = { uri: string; name: string; mime: string; size: number };
export type UploadState = { uploadId?: string; received?: number };
const CHUNK = 5 * 1024 * 1024;
export const MAX_UPLOAD = 1024 * 1024 * 1024;

async function readChunk(f: UploadFile, offset: number, len: number): Promise<Blob | Uint8Array> {
  if (Platform.OS === 'web') { const blob = await (await fetch(f.uri)).blob(); return blob.slice(offset, offset + len); }
  const { File, FileMode } = require('expo-file-system');
  const h = new File(f.uri).open(FileMode.ReadOnly);
  try { h.offset = offset; return await h.readBytes(len); } finally { h.close(); }
}

export async function fileSize(uri: string): Promise<number> {
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  const { File } = require('expo-file-system'); return new File(uri).size ?? 0;
}

/** Uploads (or resumes) a file. Calls onState after each chunk so the outbox can persist progress. */
export async function uploadResumable(f: UploadFile, st: UploadState, onState: (s: UploadState) => void, onProgress?: (p: number) => void) {
  if (f.size > MAX_UPLOAD) throw new ApiError(413, 'Files can be up to 1 GB');
  let uploadId = st.uploadId; let received = st.received ?? 0;
  if (!uploadId) { const r = await call<any>('POST', '/uploads', { filename: f.name, size: f.size, mime: f.mime }); uploadId = r.uploadId; received = r.received ?? 0; onState({ uploadId, received }); }
  else { try { const s = await call<any>('GET', `/uploads/${uploadId}`); received = s.received; if (s.done) return call<any>('POST', `/uploads/${uploadId}/complete`); } catch (e: any) { if (e.status === 404) { onState({}); return uploadResumable(f, {}, onState, onProgress); } throw e; } }
  const { apiUrl, token } = useSession.getState();
  while (received < f.size) {
    const body = await readChunk(f, received, Math.min(CHUNK, f.size - received));
    let r: Response;
    try { r = await fetch(`${apiUrl}/uploads/${uploadId}/chunk?offset=${received}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: body as any }); }
    catch { throw new ApiError(0, 'Offline — upload will resume automatically'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && typeof j.received === 'number') { received = j.received; onState({ uploadId, received }); continue; }  // server says resume elsewhere
    if (!r.ok) throw new ApiError(r.status, j.detail ?? 'Upload failed');
    received = j.received; onState({ uploadId, received }); onProgress?.(received / f.size);
  }
  return call<any>('POST', `/uploads/${uploadId}/complete`);
}

/** One-shot helper for Glow (Drops, Blinks, avatar/cover): resumable upload of a picked photo/video → { url, kind }. */
export async function uploadMedia(uri: string, mime: string, name: string, onProgress?: (p: number) => void): Promise<{ url: string; kind: string; mime: string; durationSec?: number }> {
  const size = await fileSize(uri);
  return uploadResumable({ uri, name, mime, size }, {}, () => {}, onProgress);
}
export const isVideoUrl = (u?: string | null) => !!u && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
