"""Seed layers for server-driven config, including hi/ta/te UI strings."""
KEYS = ["nav.Home", "nav.Explore", "nav.Create", "nav.Motion", "nav.Profile", "nav.Chats", "nav.Friends", "nav.Vibes", "nav.Towns", "nav.ChatMe",
        "module.Social", "module.Chat", "dswitch.toSocial", "dswitch.toChat", "tab.Feed", "tab.Following", "tab.ForYou", "tab.Requests", "tab.Incoming", "tab.Outgoing",
        "section.Pinned", "section.AllChats", "section.Groups", "section.Family", "section.Work", "section.Starred", "section.RecentVibes", "section.MyVibe",
        "section.MyTowns", "section.DiscoverTowns", "section.Channels", "section.Board", "section.Notifications", "section.Settings", "section.Privacy",
        "section.Security", "section.Earnings", "section.Loops", "action.Search", "action.NewChat", "action.AddFriend", "common.TurnedOff"]
HI = ["होम", "खोजें", "बनाएं", "मोशन", "प्रोफ़ाइल", "चैट्स", "दोस्त", "वाइब्स", "टाउन्स", "मैं",
      "सोशल", "चैट", "सोशल पर जाएं", "चैट पर जाएं", "फ़ीड", "फ़ॉलोइंग", "आपके लिए", "अनुरोध", "आने वाले", "भेजे गए",
      "पिन किए गए", "सभी चैट्स", "ग्रुप्स", "परिवार", "काम", "तारांकित", "हाल की वाइब्स", "मेरी वाइब",
      "मेरे टाउन्स", "टाउन्स खोजें", "चैनल", "सूचना बोर्ड", "सूचनाएं", "सेटिंग्स", "गोपनीयता",
      "सुरक्षा", "कमाई", "लूप्स", "खोजें", "नई चैट", "दोस्त जोड़ें", "आपके क्षेत्र में बंद है"]
TA = ["முகப்பு", "தேடு", "உருவாக்கு", "மோஷன்", "சுயவிவரம்", "அரட்டைகள்", "நண்பர்கள்", "வைப்ஸ்", "டவுன்கள்", "நான்",
      "சோஷியல்", "அரட்டை", "சோஷியலுக்குச் செல்", "அரட்டைக்குச் செல்", "ஊட்டம்", "பின்தொடர்பவை", "உங்களுக்காக", "கோரிக்கைகள்", "வந்தவை", "அனுப்பியவை",
      "பின் செய்தவை", "அனைத்து அரட்டைகள்", "குழுக்கள்", "குடும்பம்", "வேலை", "நட்சத்திரமிட்டவை", "சமீபத்திய வைப்ஸ்", "என் வைப்",
      "என் டவுன்கள்", "டவுன்களைக் கண்டறி", "சேனல்கள்", "அறிவிப்புப் பலகை", "அறிவிப்புகள்", "அமைப்புகள்", "தனியுரிமை",
      "பாதுகாப்பு", "வருமானம்", "லூப்ஸ்", "தேடு", "புதிய அரட்டை", "நண்பரைச் சேர்", "உங்கள் பகுதியில் முடக்கப்பட்டுள்ளது"]
TE = ["హోమ్", "అన్వేషించు", "సృష్టించు", "మోషన్", "ప్రొఫైల్", "చాట్‌లు", "స్నేహితులు", "వైబ్స్", "టౌన్‌లు", "నేను",
      "సోషల్", "చాట్", "సోషల్‌కు వెళ్ళు", "చాట్‌కు వెళ్ళు", "ఫీడ్", "ఫాలోయింగ్", "మీ కోసం", "అభ్యర్థనలు", "వచ్చినవి", "పంపినవి",
      "పిన్ చేసినవి", "అన్ని చాట్‌లు", "గ్రూపులు", "కుటుంబం", "పని", "నక్షత్రం గుర్తు పెట్టినవి", "ఇటీవలి వైబ్స్", "నా వైబ్",
      "నా టౌన్‌లు", "టౌన్‌లను కనుగొను", "ఛానెల్‌లు", "నోటీసు బోర్డు", "నోటిఫికేషన్‌లు", "సెట్టింగ్‌లు", "గోప్యత",
      "భద్రత", "సంపాదన", "లూప్స్", "వెతుకు", "కొత్త చాట్", "స్నేహితుడిని జోడించు", "మీ ప్రాంతంలో ఆపివేయబడింది"]
# v3 Gen-Z renames (Glow/Hush, Hub/Drift/Make/Flicks/Me, Hush/Squad/Moods/Hoods/Me) — transliterated, same names in every language.
RENAMED = {
    "hi": ["हब", "ड्रिफ्ट", "मेक", "फ़्लिक्स", "मैं", "हश", "स्क्वॉड", "मूड्स", "हुड्स", "मैं", "ग्लो", "हश"],
    "ta": ["ஹப்", "டிரிஃப்ட்", "மேக்", "ஃப்ளிக்ஸ்", "நான்", "ஹஷ்", "ஸ்க்வாட்", "மூட்ஸ்", "ஹுட்ஸ்", "நான்", "க்ளோ", "ஹஷ்"],
    "te": ["హబ్", "డ్రిఫ్ట్", "మేక్", "ఫ్లిక్స్", "నేను", "హష్", "స్క్వాడ్", "మూడ్స్", "హుడ్స్", "నేను", "గ్లో", "హష్"]}
for _lst, _code in ((HI, "hi"), (TA, "ta"), (TE, "te")): _lst[:12] = RENAMED[_code]
EXTRA_KEYS = ["module.social", "module.chat", "name.story", "name.post", "name.store", "name.subscription", "name.tip", "name.payout", "name.ads"]
EXTRA = {"hi": ["ग्लो", "हश", "ब्लिंक्स", "ड्रॉप्स", "स्टैश", "बैकस्टेज पास", "प्रॉप्स", "कैशआउट", "बूस्ट्स"],
         "ta": ["க்ளோ", "ஹஷ்", "ப்ளிங்க்ஸ்", "டிராப்ஸ்", "ஸ்டாஷ்", "பேக்ஸ்டேஜ் பாஸ்", "ப்ராப்ஸ்", "கேஷ்அவுட்", "பூஸ்ட்ஸ்"],
         "te": ["గ్లో", "హష్", "బ్లింక్స్", "డ్రాప్స్", "స్టాష్", "బ్యాక్‌స్టేజ్ పాస్", "ప్రాప్స్", "క్యాష్‌అవుట్", "బూస్ట్స్"]}
KEYS = KEYS + EXTRA_KEYS; HI = HI + EXTRA["hi"]; TA = TA + EXTRA["ta"]; TE = TE + EXTRA["te"]
assert len(KEYS) == len(HI) == len(TA) == len(TE)

LAYERS = {
    "base": {},
    "country:US": {"features": {"paidLoops": False, "payouts": False}, "screens": {"Payout": False},
                   "banner": {"id": "us-payouts", "text": "Payouts and paid Loops are not available in this country yet.", "tone": "info"},
                   "theme": {"social": {"preset": "ocean"}, "chat": {"preset": "coral"}}},
    "zone:IN-SOUTH": {"banner": {"id": "try-tamil", "text": "VibeLoop is available in தமிழ் — switch language in Settings.", "tone": "suggest", "suggestLang": "ta"}},
    "slab:pro": {"limits": {"maxGroupSize": 200}, "fees": {"platformFee": 0.06}, "theme": {"chat": {"preset": "midnight"}}},
    "lang:hi": {"languages": {"strings": dict(zip(KEYS, HI))}},
    "lang:ta": {"languages": {"strings": dict(zip(KEYS, TA))}},
    "lang:te": {"languages": {"strings": dict(zip(KEYS, TE))}},
}
