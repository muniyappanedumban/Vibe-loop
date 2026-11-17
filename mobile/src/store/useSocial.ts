import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, HOUR, DAY } from '../lib/util';
import { bg, replacePost, replaceChat } from '../lib/sync';

export type Creator = { id: string; name: string; handle: string; hue: number; city: string; badge?: boolean; bio: string; followers: number };
export type Post = { id: string; by: string; kind: 'photo' | 'carousel' | 'thought' | 'motion'; text: string; hue: number; slides?: number; mood: string; interest: string; place?: string; at: number; reactions: Record<string, number>; comments: { by: string; text: string }[]; shares: number; views: number; mine?: boolean; bg?: string;
  mediaUrl?: string | null; lens?: string | null; lat?: number | null; lng?: number | null; tags?: string[]; collab?: string | null; sound?: string | null; audience?: string };
export type Spark = { id: string; by: string; hue: number; text: string; poll?: { q: string; a: string; b: string; va: number; vb: number }; close?: boolean; at: number; lens?: string | null; mediaUrl?: string | null; place?: string | null; expiresAt?: number };
export type Msg = { id: string; from: string; text: string; at: number; react?: number };
export type Chat = { id: string; title: string; members: string[]; group: boolean; pinned: boolean; muted: boolean; msgs: Msg[]; request?: boolean };
export type Tribe = { id: string; name: string; kind: string; members: number; hue: number; desc: string };
export type LiveEv = { id: string; by: string; title: string; at: number; hue: number };

const t = Date.now();
export const CREATORS: Creator[] = [
  { id: 'u1', name: 'Aanya Rao', handle: '@aanya.eats', hue: 20, city: 'Bengaluru', badge: true, bio: 'Street food, one plate at a time', followers: 12800 },
  { id: 'u2', name: 'Kabir Shah', handle: '@kabir.frames', hue: 260, city: 'Mumbai', bio: 'Cinematic city walks', followers: 8400 },
  { id: 'u3', name: 'Meera Iyer', handle: '@meera.learns', hue: 160, city: 'Chennai', badge: true, bio: 'Finance, explained simply', followers: 22100 },
  { id: 'u4', name: 'Zoya Khan', handle: '@zoya.draws', hue: 320, city: 'Hyderabad', bio: 'Illustrator · color days', followers: 5300 },
  { id: 'u5', name: 'Rohan Das', handle: '@rohan.plays', hue: 200, city: 'Kolkata', bio: 'Cricket takes & gaming', followers: 9700 },
  { id: 'u6', name: 'Tara Menon', handle: '@tara.trails', hue: 120, city: 'Kochi', bio: 'Slow travel across India', followers: 15600 },
];
const P = (id: string, by: string, kind: Post['kind'], text: string, hue: number, mood: string, interest: string, h: number, extra: Partial<Post> = {}): Post =>
  ({ id, by, kind, text, hue, mood, interest, at: t - h * HOUR, reactions: { heart: 40 + h * 3, fire: 12 + h, laugh: mood === 'Funny' ? 30 : 2, touch: 5, clap: 9, boom: 3 }, comments: [{ by: 'u3', text: 'Love this!' }, { by: 'u5', text: 'Saving it' }], shares: 4 + h, views: 900 + h * 140, ...extra });
const SEED_POSTS: Post[] = [
  P('p1', 'u1', 'photo', 'Benne dosa at 7am hits different. Tag your breakfast buddy.', 25, 'Happy', 'Food', 1, { place: 'VV Puram, Bengaluru' }),
  P('p2', 'u2', 'motion', 'Marine Drive at golden hour — one take, no cuts.', 230, 'Relaxing', 'Travel', 2),
  P('p3', 'u3', 'carousel', '5 money habits I wish I had at 22 (swipe →)', 150, 'Inspiring', 'Finance', 3, { slides: 5 }),
  P('p4', 'u4', 'thought', 'Today\'s Color Day is MANGO. Show me something yellow ', 45, 'Inspiring', 'Art', 4, { bg: '#FFC23D' }),
  P('p5', 'u5', 'motion', 'When the last-ball six actually happens', 200, 'Funny', 'Sports', 5),
  P('p6', 'u6', 'photo', 'Backwaters before the tourists wake up.', 130, 'Relaxing', 'Travel', 7, { place: 'Alleppey' }),
  P('p7', 'u1', 'motion', 'Rating every chaat stall on one street', 10, 'Funny', 'Food', 9),
  P('p8', 'u3', 'thought', 'One Question: what\'s the best advice you got about money?', 280, 'Emotional', 'Finance', 12, { bg: '#6C3BFF' }),
];
const SEED_SPARKS: Spark[] = [
  { id: 's1', by: 'u1', hue: 30, text: 'New stall alert in Jayanagar', at: t - 2 * HOUR, poll: { q: 'Dosa or idli?', a: 'Dosa', b: 'Idli', va: 64, vb: 31 } },
  { id: 's2', by: 'u4', hue: 320, text: 'WIP for Color Day', at: t - 3 * HOUR, close: true },
  { id: 's3', by: 'u6', hue: 120, text: 'Sunrise in Munnar', at: t - 5 * HOUR },
  { id: 's4', by: 'u2', hue: 250, text: 'Shooting a night walk tonight', at: t - 6 * HOUR },
  { id: 's5', by: 'u5', hue: 200, text: 'Match day mood', at: t - 8 * HOUR, poll: { q: 'Who wins?', a: 'Home', b: 'Away', va: 120, vb: 98 } },
];
const SEED_CHATS: Chat[] = [
  { id: 'c1', title: 'Aanya Rao', members: ['u1'], group: false, pinned: true, muted: false, msgs: [{ id: 'm1', from: 'u1', text: 'Your chai episode had me crying ', at: t - 50 * 60000 }, { id: 'm2', from: 'me', text: 'Haha thank you! Collab on a food ep?', at: t - 40 * 60000 }, { id: 'm3', from: 'u1', text: 'Yes!! Saturday?', at: t - 30 * 60000 }] },
  { id: 'c2', title: 'Creator Relay · Ep chain', members: ['u2', 'u4', 'u6'], group: true, pinned: false, muted: false, msgs: [{ id: 'm4', from: 'u4', text: 'I posted part 3, who\'s next?', at: t - 2 * HOUR }] },
  { id: 'c3', title: 'Meera Iyer', members: ['u3'], group: false, pinned: false, muted: true, msgs: [{ id: 'm5', from: 'u3', text: 'Sent you the SIP explainer script', at: t - DAY }] },
  { id: 'c4', title: 'Unknown · @promo.deals', members: ['x1'], group: false, pinned: false, muted: false, request: true, msgs: [{ id: 'm6', from: 'x1', text: 'Want 10k followers fast?', at: t - 3 * HOUR }] },
];
export const TRIBES: Tribe[] = [
  { id: 't1', name: 'Bengaluru Foodies', kind: 'Food', members: 4820, hue: 25, desc: 'Darshinis, dosas and late-night biryani' },
  { id: 't2', name: 'Mumbai City Walkers', kind: 'City', members: 3110, hue: 230, desc: 'Heritage walks every Sunday' },
  { id: 't3', name: 'Indie Game Devs India', kind: 'Gaming', members: 1980, hue: 280, desc: 'Ship small games, together' },
  { id: 't4', name: 'Color Day Artists', kind: 'Creative', members: 2640, hue: 330, desc: 'A daily color challenge' },
  { id: 't5', name: 'IIT-M Campus Buzz', kind: 'Student', members: 1450, hue: 170, desc: 'Fests, notes and memes' },
  { id: 't6', name: 'Cricket Couch Crew', kind: 'Sports', members: 6730, hue: 200, desc: 'Ball-by-ball banter' },
];
export const LIVES: LiveEv[] = [
  { id: 'v1', by: 'u3', title: 'Budgeting Q&A for first jobbers', at: t + 2 * HOUR, hue: 160 },
  { id: 'v2', by: 'u1', title: 'Street food crawl — Live Together', at: t + 26 * HOUR, hue: 25 },
  { id: 'v3', by: 'u4', title: 'Color Day live sketch', at: t + 50 * HOUR, hue: 320 },
];

type S = {
  creators: Creator[]; tribes: Tribe[]; lives: LiveEv[];
  posts: Post[]; sparks: Spark[]; chats: Chat[]; following: string[]; requested: string[]; saved: string[]; myReacts: Record<string, string>; joined: string[];
  blocked: string[]; restricted: string[]; reports: { id: string; target: string; reason: string; at: number }[]; seenSparks: string[]; votes: Record<string, 'a' | 'b'>;
  privacy: { privateAccount: boolean; teenSpace: boolean; hideLikes: boolean; commentGuard: boolean; guardWords: string[]; msgRequests: boolean };
  reactionPack: number[]; lessons: string[]; reminders: string[]; profileMood: number; bio: string;
};
type A = {
  react: (postId: string, key: string) => void; save: (postId: string) => void; follow: (id: string) => void; comment: (postId: string, text: string) => void; share: (postId: string) => void;
  addPost: (p: Omit<Post, 'id' | 'at' | 'reactions' | 'comments' | 'shares' | 'views' | 'by'>) => void; deletePost: (id: string) => void;
  send: (chatId: string, text: string) => void; reactMsg: (chatId: string, msgId: string, moji: number) => void; togglePin: (id: string) => void; toggleMute: (id: string) => void; acceptRequest: (id: string) => void; deleteChat: (id: string) => void;
  join: (id: string) => void; block: (id: string) => void; restrict: (id: string) => void; report: (target: string, reason: string) => void;
  seeSpark: (id: string) => void; vote: (id: string, v: 'a' | 'b') => void; setPrivacy: (k: keyof S['privacy'], v: any) => void;
  togglePack: (id: number) => void; doneLesson: (id: string) => void; remind: (id: string) => void; setMood: (id: number) => void; setBio: (b: string) => void;
};
const prefs = () => { const s = useSocial.getState(); bg('PUT', '/social-prefs', { privacy: s.privacy, reactionPack: s.reactionPack, lessons: s.lessons, profileMood: s.profileMood, bio: s.bio }); };
export const useSocial = create<S & A>()(persist(immer(set => ({
  creators: CREATORS, tribes: TRIBES, lives: LIVES,
  posts: SEED_POSTS, sparks: SEED_SPARKS, chats: SEED_CHATS, following: ['u1', 'u3', 'u4'], requested: [], saved: ['p3'], myReacts: {}, joined: ['t1'], blocked: [], restricted: [], reports: [], seenSparks: [], votes: {},
  privacy: { privateAccount: false, teenSpace: false, hideLikes: false, commentGuard: true, guardWords: ['spam', 'fake followers'], msgRequests: true },
  reactionPack: [7, 42, 118, 203, 77, 311], lessons: [], reminders: [], profileMood: 118, bio: 'Comedy shorts about office chai life · testing everything in Loops first',
  react: (id, key) => { bg('POST', `/posts/${id}/react`, { key }, replacePost); set(s => { const p = s.posts.find(x => x.id === id); if (!p) return; const prev = s.myReacts[id]; if (prev) p.reactions[prev]--; if (prev === key) delete s.myReacts[id]; else { p.reactions[key] = (p.reactions[key] || 0) + 1; s.myReacts[id] = key; } }); },
  save: id => { bg('POST', `/edges/save/${id}`); set(s => { s.saved = s.saved.includes(id) ? s.saved.filter(x => x !== id) : [id, ...s.saved]; }); },
  // Private accounts answer "requested" (Follow Knock): reflect the server's state instead of assuming "following".
  follow: id => {
    bg('POST', `/edges/follow/${id}`, undefined, (r: any) => set(s => {
      const st = r?.state ?? (r?.on ? 'following' : 'none');
      s.following = st === 'following' ? Array.from(new Set([...s.following, id])) : s.following.filter(x => x !== id);
      s.requested = st === 'requested' ? Array.from(new Set([...(s.requested ?? []), id])) : (s.requested ?? []).filter(x => x !== id);
    }));
    set(s => { if ((s.requested ?? []).includes(id)) { s.requested = s.requested.filter(x => x !== id); return; } s.following = s.following.includes(id) ? s.following.filter(x => x !== id) : [...s.following, id]; });
  },
  comment: (id, text) => { bg('POST', `/posts/${id}/comments`, { text }, (r: any) => replacePost(r.post)); set(s => { const p = s.posts.find(x => x.id === id); if (!p) return; const bad = s.privacy.commentGuard && s.privacy.guardWords.some(w => text.toLowerCase().includes(w.toLowerCase())); if (!bad) p.comments.push({ by: 'me', text }); }); },
  share: id => { bg('POST', `/posts/${id}/share`); set(s => { const p = s.posts.find(x => x.id === id); if (p) p.shares++; }); },
  addPost: p => { const id = uid('p'); bg('POST', '/posts', { ...p, id }, replacePost); set(s => { s.posts.unshift({ ...p, id, by: 'me', at: Date.now(), reactions: { heart: 0, fire: 0, laugh: 0, touch: 0, clap: 0, boom: 0 }, comments: [], shares: 0, views: 0, mine: true }); }); },
  deletePost: id => { bg('DELETE', `/posts/${id}`); set(s => { s.posts = s.posts.filter(p => p.id !== id); }); },
  send: (cid, text) => { bg('POST', `/chats/${cid}/messages`, { text }, replaceChat); set(s => { const c = s.chats.find(x => x.id === cid); if (c) c.msgs.push({ id: uid('m'), from: 'me', text, at: Date.now() }); }); },
  reactMsg: (cid, mid, moji) => { bg('POST', `/chats/${cid}/messages/${mid}/react`, { moji }, replaceChat); set(s => { const m = s.chats.find(x => x.id === cid)?.msgs.find(x => x.id === mid); if (m) m.react = m.react === moji ? undefined : moji; }); },
  togglePin: id => { const c0 = useSocial.getState().chats.find(x => x.id === id); bg('PATCH', `/chats/${id}`, { pinned: !c0?.pinned }); set(s => { const c = s.chats.find(x => x.id === id); if (c) c.pinned = !c.pinned; }); },
  toggleMute: id => { const c0 = useSocial.getState().chats.find(x => x.id === id); bg('PATCH', `/chats/${id}`, { muted: !c0?.muted }); set(s => { const c = s.chats.find(x => x.id === id); if (c) c.muted = !c.muted; }); },
  acceptRequest: id => { bg('PATCH', `/chats/${id}`, { request: false }); set(s => { const c = s.chats.find(x => x.id === id); if (c) c.request = false; }); },
  deleteChat: id => set(s => { s.chats = s.chats.filter(c => c.id !== id); }),
  join: id => { bg('POST', `/edges/join/${id}`); set(s => { s.joined = s.joined.includes(id) ? s.joined.filter(x => x !== id) : [...s.joined, id]; }); },
  block: id => { bg('POST', `/edges/block/${id}`); set(s => { s.blocked = s.blocked.includes(id) ? s.blocked.filter(x => x !== id) : [...s.blocked, id]; }); },
  restrict: id => { bg('POST', `/edges/restrict/${id}`); set(s => { s.restricted = s.restricted.includes(id) ? s.restricted.filter(x => x !== id) : [...s.restricted, id]; }); },
  report: (target, reason) => { bg('POST', '/reports', { target, reason }); set(s => { s.reports.unshift({ id: uid('rp'), target, reason, at: Date.now() }); }); },
  seeSpark: id => set(s => { if (!s.seenSparks.includes(id)) s.seenSparks.push(id); }),
  vote: (id, v) => { if (!useSocial.getState().votes[id]) bg('POST', `/sparks/${id}/vote`, { v }); set(s => { const sp = s.sparks.find(x => x.id === id); if (!sp?.poll || s.votes[id]) return; s.votes[id] = v; v === 'a' ? sp.poll.va++ : sp.poll.vb++; }); },
  setPrivacy: (k, v) => { set(s => { (s.privacy as any)[k] = v; }); prefs(); },
  togglePack: id => { set(s => { s.reactionPack = s.reactionPack.includes(id) ? s.reactionPack.filter(x => x !== id) : [...s.reactionPack, id].slice(-12); }); prefs(); },
  doneLesson: id => { set(s => { s.lessons = s.lessons.includes(id) ? s.lessons.filter(x => x !== id) : [...s.lessons, id]; }); prefs(); },
  remind: id => { bg('POST', `/edges/remind/${id}`); set(s => { s.reminders = s.reminders.includes(id) ? s.reminders.filter(x => x !== id) : [...s.reminders, id]; }); },
  setMood: id => { set(s => { s.profileMood = id; }); prefs(); }, setBio: b => { set(s => { s.bio = b; }); prefs(); },
})), { name: 'vibeloop-social-v1', storage: createJSONStorage(() => AsyncStorage) }));
export const creator = (id: string) => useSocial.getState().creators.find(c => c.id === id) ?? CREATORS.find(c => c.id === id) ?? { id, name: id === 'me' ? 'You' : 'Unknown', handle: id === 'me' ? '@you' : '@unknown', hue: 280, city: '', bio: '', followers: 0 };
export const compact = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
/** Follow button label honouring Follow Knocks (private accounts): Following / Requested / Follow. */
export const followLabel = (s: { following: string[]; requested?: string[] }, id: string) => (s.following.includes(id) ? 'Following' : (s.requested ?? []).includes(id) ? 'Requested' : 'Follow');
