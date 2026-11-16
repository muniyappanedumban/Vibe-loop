// On-device text tools for Hush. Nothing is sent anywhere.
// Quick Polish: rule-based clean-up (not AI). Phrasebook: common phrases only — full translation needs a provider.
const FIXES: [RegExp, string][] = [
  [/\bi\b/g, 'I'], [/\bim\b/gi, "I'm"], [/\bdont\b/gi, "don't"], [/\bcant\b/gi, "can't"], [/\bwont\b/gi, "won't"], [/\bdidnt\b/gi, "didn't"],
  [/\bisnt\b/gi, "isn't"], [/\bdoesnt\b/gi, "doesn't"], [/\bthats\b/gi, "that's"], [/\bwhats\b/gi, "what's"], [/\bive\b/gi, "I've"], [/\bill\b(?= (be|do|go|call|send|see))/gi, "I'll"],
  [/\bteh\b/gi, 'the'], [/\brecieve\b/gi, 'receive'], [/\bdefinately\b/gi, 'definitely'], [/\bseperate\b/gi, 'separate'], [/\boccured\b/gi, 'occurred'], [/\buntill\b/gi, 'until'],
  [/\bwierd\b/gi, 'weird'], [/\bbeleive\b/gi, 'believe'], [/\bfreind\b/gi, 'friend'], [/\btommorow\b|\btomorow\b/gi, 'tomorrow'], [/\balot\b/gi, 'a lot'],
  [/ {2,}/g, ' '], [/\s+([,.!?])/g, '$1'], [/([,.!?])(?=[A-Za-z])/g, '$1 '],
];
export function polish(text: string): { text: string; changes: number } {
  let out = text.trim(); let changes = 0;
  for (const [re, rep] of FIXES) { const next = out.replace(re, rep as any); if (next !== out) { changes++; out = next; } }
  if (out && /^[a-z]/.test(out)) { out = out[0].toUpperCase() + out.slice(1); changes++; }
  return { text: out, changes };
}
const PHRASES: Record<string, { hi: string; ta: string }> = {
  'hello': { hi: 'नमस्ते', ta: 'வணக்கம்' }, 'hi': { hi: 'नमस्ते', ta: 'ஹாய்' }, 'thank you': { hi: 'धन्यवाद', ta: 'நன்றி' }, 'thanks': { hi: 'शुक्रिया', ta: 'நன்றி' },
  'good morning': { hi: 'सुप्रभात', ta: 'காலை வணக்கம்' }, 'good night': { hi: 'शुभ रात्रि', ta: 'இனிய இரவு' }, 'how are you': { hi: 'आप कैसे हैं', ta: 'எப்படி இருக்கீங்க' },
  'see you soon': { hi: 'जल्द मिलते हैं', ta: 'விரைவில் சந்திப்போம்' }, 'on my way': { hi: 'रास्ते में हूँ', ta: 'வழியில் இருக்கேன்' }, 'yes': { hi: 'हाँ', ta: 'ஆம்' }, 'no': { hi: 'नहीं', ta: 'இல்லை' },
  'sorry': { hi: 'माफ़ कीजिए', ta: 'மன்னிக்கவும்' }, 'congratulations': { hi: 'बधाई हो', ta: 'வாழ்த்துக்கள்' }, 'call me': { hi: 'मुझे कॉल करो', ta: 'எனக்கு கால் பண்ணுங்க' },
  'i am busy': { hi: 'मैं व्यस्त हूँ', ta: 'நான் பிஸியா இருக்கேன்' }, 'where are you': { hi: 'तुम कहाँ हो', ta: 'எங்க இருக்கீங்க' }, 'happy birthday': { hi: 'जन्मदिन मुबारक', ta: 'பிறந்தநாள் வாழ்த்துக்கள்' },
  'love you': { hi: 'प्यार करता हूँ', ta: 'லவ் யூ' }, 'take care': { hi: 'ध्यान रखना', ta: 'பார்த்துக்கோங்க' }, 'let us meet': { hi: 'चलो मिलते हैं', ta: 'சந்திப்போம்' },
};
/** Returns a translation only for known phrases; null otherwise (never guesses). */
export function phrasebook(text: string, to: 'hi' | 'ta' | 'en'): string | null {
  const key = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (to === 'en') { for (const [en, t] of Object.entries(PHRASES)) if (t.hi === text.trim() || t.ta === text.trim()) return en[0].toUpperCase() + en.slice(1); return null; }
  return PHRASES[key]?.[to] ?? null;
}
