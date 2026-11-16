// Hush "smart messages": rich text, special cards carried as text tokens (so every client & old build can show them),
// slash commands, smart replies, quick replies, and local chat prefs (archive / mark unread).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CC } from './theme';
import { ChatIcon } from './ChatIcon';

// ---------- rich text: *bold* _italic_ ~strike~ `code` ||spoiler|| @mention ----------
export function RichText({ text, me, onMention }: { text: string; me: boolean; onMention?: (h: string) => void }) {
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|\|\|[^|\n]+\|\||@[a-z0-9._]{3,20})/gi).filter(Boolean);
  const base = { fontSize: 15, fontWeight: '500' as const, color: me ? '#fff' : CC.ink, lineHeight: 21 };
  return (
    <Text style={base}>{parts.map((p, i) => {
      if (/^\*[^*]+\*$/.test(p)) return <Text key={i} style={{ fontWeight: '900' }}>{p.slice(1, -1)}</Text>;
      if (/^_[^_]+_$/.test(p)) return <Text key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</Text>;
      if (/^~[^~]+~$/.test(p)) return <Text key={i} style={{ textDecorationLine: 'line-through' }}>{p.slice(1, -1)}</Text>;
      if (/^`[^`]+`$/.test(p)) return <Text key={i} style={{ fontFamily: 'monospace', backgroundColor: me ? 'rgba(255,255,255,.18)' : CC.tealSoft }}>{p.slice(1, -1)}</Text>;
      if (/^\|\|[^|]+\|\|$/.test(p)) return <Text key={i} onPress={() => setShown(s => ({ ...s, [i]: true }))} style={shown[i] ? {} : { backgroundColor: me ? 'rgba(255,255,255,.85)' : CC.ink, color: me ? 'rgba(255,255,255,.85)' : CC.ink }}>{p.slice(2, -2)}</Text>;
      if (/^@[a-z0-9._]{3,20}$/i.test(p)) return <Text key={i} onPress={() => onMention?.(p)} style={{ fontWeight: '900', color: me ? '#fff' : CC.teal, textDecorationLine: 'underline' }}>{p}</Text>;
      return <Text key={i}>{p}</Text>;
    })}</Text>
  );
}

// ---------- token cards ----------
export type Token = { t: 'mystery'; text: string } | { t: 'timer'; at: number; label: string } | { t: 'place'; lat: number; lng: number; name: string } | { t: 'id'; handle: string; name: string };
export function parseToken(text: string): Token | null {
  let m = /^\[\[mystery:([\s\S]{1,500})\]\]$/.exec(text); if (m) return { t: 'mystery', text: m[1] };
  m = /^\[\[timer:(\d{10,14})\|([^\]]{0,60})\]\]$/.exec(text); if (m) return { t: 'timer', at: Number(m[1]), label: m[2] };
  m = /^\[\[place:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\|([^\]]{0,80})\]\]$/.exec(text); if (m) return { t: 'place', lat: Number(m[1]), lng: Number(m[2]), name: m[3] };
  m = /^\[\[id:(@[a-z0-9._]{3,20})\|([^\]]{0,40})\]\]$/i.exec(text); if (m) return { t: 'id', handle: m[1], name: m[2] };
  return null;
}
export const tok = {
  mystery: (text: string) => `[[mystery:${text}]]`, timer: (at: number, label: string) => `[[timer:${at}|${label.replace(/[\]|]/g, '')}]]`,
  place: (lat: number, lng: number, name: string) => `[[place:${lat.toFixed(4)},${lng.toFixed(4)}|${name.replace(/[\]|]/g, '')}]]`, id: (handle: string, name: string) => `[[id:${handle}|${name.replace(/[\]|]/g, '')}]]`,
};
function Countdown({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const d = Math.max(0, at - now); const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000), s = Math.floor((d % 60000) / 1000);
  return <Text style={{ fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{d ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : "It's time!"}</Text>;
}
export function TokenCard({ tk, me, onOpenId }: { tk: Token; me: boolean; onOpenId?: (h: string) => void }) {
  const [open, setOpen] = useState(false); const fg = me ? '#fff' : CC.ink; const soft = me ? 'rgba(255,255,255,.8)' : CC.inkSoft;
  if (tk.t === 'mystery') return (
    <Pressable onPress={() => setOpen(true)} style={{ minWidth: 200 }} accessibilityRole="button" accessibilityLabel="Reveal Mystery Drop">
      <Text style={{ fontWeight: '900', color: fg }}>Mystery Drop</Text>
      <Text style={{ color: open ? fg : soft, marginTop: 4, fontSize: 15 }}>{open ? tk.text : 'Tap to reveal'}</Text>
    </Pressable>);
  if (tk.t === 'timer') return <View style={{ minWidth: 200 }}><Text style={{ fontWeight: '900', color: fg }}>Together Timer · {tk.label}</Text><View style={{ marginTop: 4 }}><Text style={{ color: fg }}><Countdown at={tk.at} /></Text></View><Text style={{ color: soft, fontSize: 11 }}>{new Date(tk.at).toLocaleString()}</Text></View>;
  if (tk.t === 'place') return (
    <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${tk.lat},${tk.lng}`)} style={{ minWidth: 200, flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="link">
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: me ? 'rgba(255,255,255,.18)' : CC.tealSoft, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="globe" size={20} color={me ? '#fff' : CC.teal} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: '900', color: fg }}>Place Drop</Text><Text style={{ color: soft }} numberOfLines={1}>{tk.name || `${tk.lat}, ${tk.lng}`}</Text><Text style={{ color: me ? CC.sun : CC.teal, fontWeight: '800', fontSize: 12 }}>Open in maps →</Text></View>
    </Pressable>);
  return (
    <Pressable onPress={() => onOpenId?.(tk.handle)} style={{ minWidth: 200, flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="button">
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: me ? 'rgba(255,255,255,.18)' : CC.tealSoft, alignItems: 'center', justifyContent: 'center' }}><ChatIcon name="qr" size={20} color={me ? '#fff' : CC.teal} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontWeight: '900', color: fg }}>{tk.name}</Text><Text style={{ color: soft }}>{tk.handle} · tap to say hi</Text></View>
    </Pressable>);
}

// ---------- slash commands ----------
export const SLASH = [
  { cmd: '/poll', hint: '/poll Question? | A | B' }, { cmd: '/decide', hint: '/decide Pizza tonight?' }, { cmd: '/mystery', hint: '/mystery your secret text' },
  { cmd: '/timer', hint: '/timer 30m Movie starts' }, { cmd: '/later', hint: '/later 2h your message' }, { cmd: '/shrug', hint: '/shrug' }, { cmd: '/me', hint: '/me is typing a novel' },
];
export type SlashResult = { kind: 'text'; text: string; sendAt?: number } | { kind: 'poll'; q: string; options: string[] } | null;
const dur = (s: string) => { const m = /^(\d+)(m|h|d)$/.exec(s); if (!m) return null; return Number(m[1]) * (m[2] === 'm' ? 60_000 : m[2] === 'h' ? 3_600_000 : 86_400_000); };
export function runSlash(input: string, myName: string): SlashResult {
  const [cmd, ...rest] = input.trim().split(/\s+/); const arg = rest.join(' ');
  switch (cmd) {
    case '/poll': { const [q, ...opts] = arg.split('|').map(x => x.trim()).filter(Boolean); return q && opts.length >= 2 ? { kind: 'poll', q, options: opts.slice(0, 4) } : null; }
    case '/decide': return arg ? { kind: 'poll', q: arg, options: ['Yes', 'No'] } : null;
    case '/mystery': return arg ? { kind: 'text', text: tok.mystery(arg) } : null;
    case '/timer': { const d = dur(rest[0] ?? ''); return d ? { kind: 'text', text: tok.timer(Date.now() + d, rest.slice(1).join(' ') || 'Countdown') } : null; }
    case '/later': { const d = dur(rest[0] ?? ''); return d && rest.length > 1 ? { kind: 'text', text: rest.slice(1).join(' '), sendAt: Date.now() + d } : null; }
    case '/shrug': return { kind: 'text', text: '¯\\_(ツ)_/¯' };
    case '/me': return arg ? { kind: 'text', text: `_${myName} ${arg}_` } : null;
    default: return null;
  }
}

// ---------- smart replies (on-device keyword rules, no AI, nothing leaves the phone) ----------
const RULES: [RegExp, string[]][] = [
  [/\b(thanks|thank you|thx|ty)\b/i, ['Anytime!', 'Ofc', 'Happy to help']], [/\?$/, ['Yes!', 'Not sure', 'Let me check']],
  [/\b(hi|hey|hello|yo|sup)\b/i, ['Hey!', "What's up?", 'Yo']], [/\b(sorry|my bad)\b/i, ['All good', 'No worries']],
  [/\b(congrats|won|got the|passed)\b/i, ['Congrats!!', 'So proud', "Let's celebrate"]], [/\b(meet|tonight|tomorrow|saturday|sunday|plan)\b/i, ["I'm in", 'What time?', "Can't make it"]],
  [/\b(lol|haha|lmao|dead)\b/i, ['Hahaha', 'Stop', "I'm crying"]], [/\b(ok|okay|cool)\b/i, ['Cool cool', 'Bet', 'Done']],
];
export const smartReplies = (last?: string) => { if (!last) return []; for (const [re, rs] of RULES) if (re.test(last)) return rs; return []; };

// ---------- local prefs: quick replies, archived & unread chats ----------
type Prefs = { quick: string[]; archived: string[]; unread: string[]; addQuick: (t: string) => void; removeQuick: (t: string) => void; toggleArchive: (id: string) => void; toggleUnread: (id: string, on?: boolean) => void };
export const useChatPrefs = create<Prefs>()(persist((set) => ({
  quick: ['On my way', 'Call you in 5', 'Can we talk later?', 'Love this'], archived: [], unread: [],
  addQuick: t => set(s => ({ quick: Array.from(new Set([t, ...s.quick])).slice(0, 12) })), removeQuick: t => set(s => ({ quick: s.quick.filter(x => x !== t) })),
  toggleArchive: id => set(s => ({ archived: s.archived.includes(id) ? s.archived.filter(x => x !== id) : [...s.archived, id] })),
  toggleUnread: (id, on) => set(s => { const has = s.unread.includes(id); const want = on ?? !has; return { unread: want ? Array.from(new Set([...s.unread, id])) : s.unread.filter(x => x !== id) }; }),
}), { name: 'vibeloop-chat-prefs', storage: createJSONStorage(() => AsyncStorage) }));
