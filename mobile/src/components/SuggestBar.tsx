// Keyword → emoji/icon suggestions from our own libraries (VibeMoji for Glow, BubbleMoji + Hush IconKit for chat).
import React, { useMemo } from 'react';
import { ScrollView, Pressable, View, Text } from 'react-native';
import { VIBEMOJI } from '../lib/vibemoji';
import { BUBBLEMOJI } from '../chat/bubblemoji';
import { VibeMoji } from './VibeMoji';
import { BubbleMoji } from '../chat/BubbleMojiView';
import { feature } from '../lib/config';

const KEYWORDS: Record<string, string[]> = {
  Joy: ['happy', 'yay', 'nice', 'good', 'great', 'smile', 'mast', 'super'], Love: ['love', 'heart', 'cute', 'miss', 'crush', 'luv'], Silly: ['lol', 'haha', 'lmao', 'funny', 'joke', 'dead'],
  Wow: ['wow', 'omg', 'whoa', 'shock', 'what', 'really'], Feels: ['sad', 'cry', 'sorry', 'miss', 'tired', 'ugh'], Fierce: ['angry', 'mad', 'grr', 'fight', 'beast'],
  Hype: ['fire', 'lit', 'hype', 'win', 'goat', 'slay', 'lets', 'go'], Calm: ['calm', 'chill', 'relax', 'sleep', 'peace', 'zen'], Party: ['party', 'bday', 'birthday', 'celebrate', 'congrats', 'cheers'], Chill: ['chill', 'vibe', 'cool', 'ok'],
  Chatty: ['hi', 'hey', 'hello', 'sup', 'yo', 'talk'], Cheer: ['congrats', 'yay', 'proud', 'win'], Curious: ['what', 'why', 'how', 'hmm', '?'], Cozy: ['tea', 'chai', 'home', 'cozy', 'night'], Cheeky: ['lol', 'wink', 'tease', 'hehe'],
};
export function suggest(text: string, kind: 'vibe' | 'bubble', n = 10): number[] {
  const words = text.toLowerCase().split(/[^a-z?]+/).filter(Boolean).slice(-4); if (!words.length) return [];
  const lib = kind === 'vibe' ? VIBEMOJI : BUBBLEMOJI;
  const cats = Object.entries(KEYWORDS).filter(([, ks]) => ks.some(k => words.includes(k))).map(([c]) => c);
  const byName = lib.filter(m => words.some(w => w.length > 2 && m.name.toLowerCase().includes(w)));
  const byCat = lib.filter(m => cats.includes(m.category));
  return Array.from(new Set([...byName, ...byCat].map(m => m.id))).slice(0, n);
}
export function SuggestBar({ text, kind, onPick }: { text: string; kind: 'vibe' | 'bubble'; onPick: (id: number) => void }) {
  const ids = useMemo(() => (feature('emojiSuggest') ? suggest(text, kind) : []), [text, kind]);
  if (!ids.length) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
        {ids.map(id => <Pressable key={id} onPress={() => onPick(id)} accessibilityLabel={`Send emoji ${id}`} style={{ padding: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.04)' }}>{kind === 'vibe' ? <VibeMoji id={id} size={30} /> : <BubbleMoji id={id} size={30} />}</Pressable>)}
      </ScrollView>
    </View>
  );
}
/** Stickers travel as a text token so every client (and old builds) can display them: [[b:123]] or [[v:123]]. */
export const stickerToken = (kind: 'vibe' | 'bubble', id: number) => `[[${kind === 'vibe' ? 'v' : 'b'}:${id}]]`;
export const parseSticker = (t: string): { kind: 'vibe' | 'bubble'; id: number } | null => { const m = /^\[\[(v|b):(\d{1,4})\]\]$/.exec(t.trim()); return m ? { kind: m[1] === 'v' ? 'vibe' : 'bubble', id: Number(m[2]) } : null; };
