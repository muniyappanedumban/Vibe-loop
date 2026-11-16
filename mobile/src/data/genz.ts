// 120 small Gen-Z features with original names. route = works in this build; no route = planned (shown honestly).
export type GenZ = { n: number; name: string; desc: string; module: 'Glow' | 'Hush' | 'Both'; route?: string };
const L = `Glow|D-Love|Double-tap a Drop to love it|Explore
Glow|Vibe Tap|Long-press for the 1000-VibeMoji picker|Explore
Glow|Lens Lab|36 named Vibe Lenses on photos, videos & Blinks|NewPost
Glow|Auto Cut|Trim any clip to a 15s hook in one tap|NewPost
Glow|Caption Align|Left / centre / right captions with Pop, Clean, Neon styles|NewPost
Glow|Speed Dial|0.5× to 2× playback for Flicks|NewPost
Glow|Blink Timer|Stories that last 1, 6, 12 or 24 hours|NewPost
Glow|Circle Only|Post just for your Inner Circle|NewPost
Glow|Quiet Share|Save a Drop privately without publishing|NewPost
Glow|Mini Vote|Add a quick poll to any Drop|NewPost
Glow|Pin 3|Pin your three favourite Drops to your profile|Profile
Glow|Save Stack|Collections for saved Drops|SaveStack
Glow|Love Trail|Private history of what you reacted to|LoveTrail
Glow|Mood Drop|Today's mood as one emoji, 24h|MoodDrop
Glow|Place Pin|Tag your spot with device location + map link|NewPost
Glow|Collab Drop|Two creators, one Drop|NewPost
Glow|Sound Tag|Label your Drop with a vibe track|NewPost
Glow|Tag Trail|#tags and @mentions picked out as you type|NewPost
Glow|Drift Moods|Feed by mood: Funny, Inspiring, Relaxing…|Explore
Glow|One Question|Daily prompt at the top of Drift|Explore
Glow|Fresh Drops|Newest first feed|Explore
Glow|Circle Feed|Only people you follow|Explore
Glow|Hype Meter|Trending feed by shares & reactions|Explore
Glow|Flicks|Full-screen vertical video feed|Motion
Glow|Reply in Hush|Answer a Blink privately in chat|Sparks
Glow|Blink Polls|Vote inside a Blink|Sparks
Glow|Two Faces|Different photo & bio for Glow and Hush|EditProfile
Glow|Cover Space|Profile banner photo|EditProfile
Glow|Link Shelf|Up to 3 links on your profile|EditProfile
Glow|Pronoun Tag|Optional pronouns on your profile|EditProfile
Glow|Stash|Creator mini-store (admin-enabled)|Stash
Glow|Backstage Pass|Creator subscriptions in ₹ (admin-enabled)|BackstagePass
Glow|Props|Send a small tip (admin-enabled)|Props
Glow|Cash Flow|Your real income in one place|CashFlow
Glow|Draft Bridge|Send an unpublished draft to a friend for feedback|LoopDetail
Glow|Loop Score|Private testing before going public|Loops
Glow|Release Gate|Publish only after your Loop earns it|ReleaseGate
Glow|Memory Graph|What works for you, learned over time|Memory
Glow|Learning Archive|Every flop, with the why|Archive
Glow|VibeMoji 1000|Original emoji library|Emoji
Glow|IconKit Glow|1000 original icons|IconKit
Glow|Glow Search|Creators, Drops, Hoods, VibeMoji|Search
Glow|Pulse Board|Your real numbers with confidence labels|Growth
Glow|Learn Path|Short lessons with progress|Learn
Hush|D-Switch|Tap or swipe between Glow and Hush|Home
Hush|Chat Bubble|Floating shortcut to Hush while browsing|Home
Hush|Dual Pulse|Separate badges for Glow and Hush|Home
Hush|Smart Jump|Notifications open the right module|Notifications
Hush|Focus Switch|Mute Glow, keep Hush|ChatMe
Hush|Privacy Split|Separate privacy for Glow and Hush|ChatMe
Hush|@ID Login|No phone number — @ID + one-time code|SignIn
Hush|Five Faces|Up to 5 accounts, instant switch|Accounts
Hush|ID Card|Your QR @ID card|MyCode
Hush|ID Finder|Find people by exact @ID only|NewChat
Hush|Request Gate|Strangers land in requests|Chats
Hush|Bubble Reply|Reply to a specific message|Chats
Hush|Star Box|Save important messages|Starred
Hush|Pin It|Pin messages|Chats
Hush|Edit Bubble|Edit within 15 minutes|Chats
Hush|Undo Send|Unsend within 60 minutes|Chats
Hush|Fade Chat|Disappearing messages|Chats
Hush|View Once|Messages that vanish after opening|Chats
Hush|Send Later|Schedule a message|Chats
Hush|Quick Poll|Polls inside chats|Chats
Hush|Chat Canvas|Bubble themes per chat|Chats
Hush|Vibe Lock|Lock a chat with device auth|Chats
Hush|Chat Folders|Friends, Family, Work, Groups|Chats
Hush|Find Anything|Search all your messages|ChatSearch
Hush|BubbleMoji 1000|Original chat emoji|BubbleMojiGallery
Hush|Sticker Drops|Send BubbleMoji as stickers|Chats
Hush|Emoji Guess|Emoji suggestions as you type|Chats
Hush|File Drop|Share files up to 1 GB, resumable|Chats
Hush|Offline Inbox|Read old chats without internet|Chats
Hush|Outbox|Messages & uploads send when you're back online|Outbox
Hush|Last Seen Switch|Show or hide last seen (reciprocal)|ChatMe
Hush|Ghost Hours|Hide activity indicators|ChatMe
Hush|Squad|Friends with requests, besties, Inner Circle|Friends
Hush|Friend Flame|Daily chat streaks|Friends
Hush|Wave|One-tap hello|Friends
Hush|Heart Ping|Lightweight appreciation|Friends
Hush|Thank You Tap|One-tap thanks card|Friends
Hush|Celebrate Tap|One-tap congrats|Friends
Hush|Moods|24h text or emoji status|Vibes
Hush|Mood Reply|Reply privately to a Mood|StatusView
Hush|Hoods|Communities with topic rooms|Towns
Hush|Hood Board|Admin announcements in a Hood|Towns
Hush|Secret Hood|Invite-code only communities|Towns
Hush|Rotating Invite|Revocable Hood invite codes|Towns
Hush|IconKit Hush|1000 original chat icons|IconKit
Hush|Hush Security|Honest encryption status & sign-out everywhere|ChatSecurity
Both|Post2Chat|Share a Drop into a chat|ShareToChat
Both|Reel2Talk|Discuss a Flick privately|ShareToChat
Both|Brand Promos|VibeLoop promos targeted by country/state|Home
Both|Region Themes|Admin colours & nav style by country|LanguageRegion
Both|Language Packs|Hindi, Tamil, Telugu labels|LanguageRegion
Glow|Now & Then|Compare two photos from different dates|
Glow|Finish My Blink|Friends add frames to your Blink|
Glow|Voice Caption|Attach a voice note to a Drop|
Glow|Reaction Selfie|React with a selfie|
Glow|Watch Party|Watch Flicks together in sync|
Glow|Duet Split|Side-by-side reply video|
Glow|Remix Lane|Remix Flicks with permission|
Glow|Beat Snap|Auto-cut to the beat|
Glow|Talk-to-Text|Speech-to-captions|
Glow|AR Lenses|Live face-tracking lenses|
Hush|Voice Bubble|Voice messages|
Hush|Video Note|Round video messages|
Hush|Call Lane|Voice & video calls|
Hush|Lounge Live|Live audio rooms in Hoods|
Hush|Talk Translate|Translate a message|
Hush|Future Drop|Schedule for tonight, tomorrow or next week|Chats
Hush|Plan Bubble|Turn a message into a plan|
Hush|Chat Notes|Shared notes in a group|
Hush|Party Chat|A group that vanishes in 24 hours|NewChat
Hush|Passkey Entry|Sign in with a passkey|
Both|Push Pulse|Real push notifications|
Both|E2E Lock|End-to-end encrypted chats (audited protocol)|
Both|Hop Back|Switch modules and land exactly where you left off|Home
Both|Hop Share|Long-press share to send a Drop to your latest chat|Explore
Glow|Glow Hub|Help, House Rules, Privacy Promise in one place|ContentHub
Hush|Hush Hub|Hush help, guide and support corner|ContentHub
Both|SOS Lane|One-tap emergency numbers (112 · 1930 · 181)|PageView
Both|Speak Up|Report harassment, scams, collab disputes|SpeakUp
Glow|Vouches|Star reviews for creators you've worked with|CreatorProfile
Glow|Real Talk|Verified-buyer product reviews|ProductView
Both|Data Receipt|Exactly what we store about you|PageView
Both|House Rules|Community terms in plain words|PageView
Both|Privacy Promise|How your data is used and protected|PageView
Both|Fresh Wire|Product news from the team|Blog
Glow|The Loopdown|Creator stories & tips|Blog
Glow|Creator Card|Tap any name to see their profile|CreatorProfile
Glow|Thread Up|Full comment threads with likes|Comments
Glow|Sticker Comments|Reply to Drops with VibeMoji stickers|Comments
Both|Promo Drops|VibeLoop updates targeted to your region|Home
Both|Region Banner|Language suggestion for your state|Home
Both|Theme Drop|Colours & nav style change by region, no update needed|LanguageRegion
Glow|Glossy Moji|Refreshed 1000-emoji look|Emoji
Glow|Lens 36|Thirty-six named lenses|NewPost
Glow|Video Blinks|Stories with real video|NewPost
Glow|1-Min Flicks|Drops up to a minute long|NewPost
Both|Avatar Swap|Change your Glow or Hush photo any time|EditProfile
Both|Outbox Pulse|See what's still waiting to send|Outbox
Both|Get the Apps|Download links for every platform|PageView
Hush|Sticker Guess|Type a word, get matching BubbleMoji|Chats
Glow|No-Filter Friday|Weekly prompt to post raw, no lens|
Glow|Glow Up Recap|Monthly reel of your best Drops|
Glow|Spill Box|Anonymous questions on your profile|
Glow|Main Character Mode|Spotlight one Drop at the top of your profile for 24h|
Glow|Lowkey Drop|Post visible only after you tap Reveal|
Glow|Era Tags|Group Drops into personal eras|
Glow|Collab Radar|Find creators near you open to collabs|
Glow|Hype Train|Friends boost a Drop together|
Glow|Caption Remix|Swap captions with a friend for a day|
Glow|Duo Blink|Two people, one story|
Hush|Rizz Check|Private emoji poll for your Squad|
Hush|Vibe Shift|Change chat colours by mood automatically|
Hush|Brb Mode|Auto-reply while you're away|
Hush|Read Later|Snooze a chat to the top later|
Hush|Squad Goals|Shared to-do list in a group|
Hush|Lore Drop|Pin the backstory of a group chat|
Hush|Tea Room|Ephemeral group that closes after 24h|
Hush|Voice Vibe|Voice notes with mood tint|
Hush|Inside Joke Stickers|Make stickers just for your Squad|
Hush|Late Night Lane|Softer theme after 11pm|
Both|IRL Meetups|Plan meetups from Hoods|
Both|Streak Shield|Protect a Friend Flame once a month|
Both|Glow Score|Private stats on how your circle engages|
Hush|Slash Moves|Type / for poll, decide, mystery, timer, later, shrug, me|Chats
Hush|Bold Moves|*bold* _italic_ ~strike~ and code style in messages|Chats
Hush|Spoiler Shield|Hide text behind ||spoiler|| until tapped|Chats
Hush|At Tag|@mention anyone; tap to open their chat|Chats
Hush|Mystery Drop|A message that reveals on tap|Chats
Hush|Together Timer|Live countdown card for plans|Chats
Hush|Decision Tap|One-tap Yes/No group decision|Chats
Hush|Smart Chips|On-device reply suggestions — nothing leaves your phone|Chats
Hush|Quick Replies|Your saved one-tap replies|Chats
Hush|Place Drop|Share your spot as a map card|Chats
Hush|ID Card Share|Send your @ID card in a chat|Chats
Hush|Pin Board|Pinned messages bar at the top of a chat|Chats
Hush|Archive Shelf|Archive chats with a long-press|Chats
Hush|Mark Unread|Come back to a chat later|Chats
Hush|Chat Export|Save a chat as text|Chats
Hush|Read Aloud|Hear the latest message read out|Chats
Hush|Sticker Reply|Send any of 1000 BubbleMoji as a sticker|Chats
Hush|Reaction Wall|React with any of 1000 BubbleMoji|Chats
Hush|Offline Drafts|Write and queue messages with no internet|Chats
Hush|File Drop XL|1 GB files with resume|Chats
Hush|Lockdown|Encryption status & sign out everywhere|ChatSecurity
Hush|Squad Flame|Streaks with friends|Friends
Hush|Mood Rings|Moods with 24h timer|Vibes
Hush|Hood Rooms|Topic rooms inside Hoods|Towns
Hush|Hush Seek|Search all messages|ChatSearch
Hush|Voice Notes|Hold to record voice messages|
Hush|Voice Speed|1×/1.5×/2× voice playback|
Hush|Typing Vibes|Live typing indicators|
Hush|Seen Receipts|Read receipts with privacy control|
Hush|Link Peek|Safe link previews|
Hush|Audio Rooms|Drop-in voice rooms|
Hush|Video Call|1:1 video calls|
Hush|Group Call|Group voice calls|
Hush|Screen Share|Share your screen in a call|
Hush|Plan Board|Turn messages into a shared plan|
Hush|Gift Drop|Send a digital gift|
Hush|Chat Games|Mini games inside chats|
Hush|Watch Room|Watch Flicks together in sync|
Hush|Photo Chain|Reply with photos only|
Hush|Selfie React|React with a selfie|
Hush|Chat Lock PIN|App PIN fallback for Vibe Lock|
Hush|Disappear Media|Self-destructing photos|
Hush|Scam Radar|Warns about suspicious links|
Hush|Bot Shield|Blocks spam bots automatically|
Hush|Message Edit History|See previous versions of an edited message|
Hush|Thread Mode|Reply threads inside groups|
Hush|Channel Mode|One-way broadcast Hoods|
Hush|Polls+|Multi-select polls|
Hush|Away Status|Custom away message|
Hush|Night Mode|Darker theme after 11pm|
Hush|Chat Backup|Encrypted backup & restore|
Hush|Desktop Hush|Use Hush on the web|
Hush|Passkey Lock|Unlock Hush with a passkey|
Hush|Copy Tap|Long-press to copy any message|Chats
Hush|Paste Pad|One-tap paste into the composer|Chats
Hush|Quick Polish|On-device grammar & spelling clean-up|Chats
Hush|Phrasebook|Common phrases in English, Hindi & Tamil|Chats
Hush|Message Info|See when a message was sent or edited|Chats`;
export const GENZ: GenZ[] = L.split('\n').map((l, i) => { const [module, name, desc, route] = l.split('|'); return { n: i + 1, module: module as GenZ['module'], name, desc, route: route || undefined }; });
