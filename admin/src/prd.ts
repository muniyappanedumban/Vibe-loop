// The 200 creator-platform features from VibeLoop_Complete_Requirements_Document.pdf §8 (wording from the PDF).
// route = screen in this build that implements it (on-device, no backend). 'Admin' = staff admin panel. No route = planned.
export type PrdFeature = { n: number; name: string; group: string; route?: string };
const G: [string, number, number][] = [['Loop Engine & Private Testing', 1, 40], ['Content Creation & Intelligence', 41, 80], ['Video, Audio & Visual Tools', 81, 110], ['Creator Memory Graph', 111, 135], ['Monetisation & Earnings', 136, 165], ['Public Release, Distribution & Safety', 166, 185], ['Analytics, Admin & Platform', 186, 200]];
const L = `Private Loop creation with creator-controlled size limit (8–50)|NewLoop
Loop Score calculated only from real human reactions|LoopDetail
Structured reactions: Would share / Would skip / Needs work + text|FanReact
Automatic sentiment summary of Loop feedback|LoopDetail
Permanent archive of every failed experiment with reasons|Archive
Side-by-side testing of two versions in the same Loop|LoopDetail
Time-limited reaction window (first 24 h counts for score)|LoopDetail
Auto-generated fan persona cards from behaviour|
One-time expiring invite links for Loops|LoopDetail
Loop health score based on feedback quality|LoopDetail
Creator can lock a Loop after decision|
Export of Loop insights as private report|
Anonymous feedback option with quality measurement|FanReact
Creator can reward high-quality feedback with credits|
Loop templates for different content types|NewLoop
Real-time reaction counter while testing|Home
Automatic improvement suggestions from past Loop data|
Fan can mark "this is for me" on drafts|FanReact
Private Q&A attached to a draft|
Silent mode for focused testing|LoopDetail
Loop member activity heatmap|
One-click resend of improved version after feedback|
Paid-only Loop option controlled by creator|NewLoop
Seasonal and festival-themed Loop templates|NewLoop
Temporary gift access to a Loop|
Low-effort reaction filter|FanReact
Private highlight reel of best reactions|
Fan private notes on drafts (visible only to them)|
Minimum Loop Score threshold set by creator|NewLoop
Failed content auto-moves to Learning Archive|Archive
Clone any previous Loop for new experiments|LoopDetail
Creator can thank specific fans later|
Exit interview for members who leave a Loop|
Multi-language reactions inside one Loop|
Creator can pin personal learning notes to a Loop|LoopDetail
Fan request-to-join system for themed Loops|
Reaction quality scoring (not just quantity)|LoopDetail
Loop vs previous Loop performance comparison|Memory
Automatic "what changed" summary between versions|
Creator can set different rules per Loop|NewLoop
Personal style fingerprint that improves over time|
Hook generator trained only on creator's own winning hooks|Copilot
Caption length and tone memory unique to each creator|
Automatic claim and offer checker (never invents prices)|Copilot
Natural conversational regional language modes|Settings
Human review queue for important content|
Full version history with visual diff|Library
Permanent "Never suggest this idea again" memory|Archive
Content DNA tagging (mood, energy, depth, pace)|Memory
Auto-generation of three different opening seconds|Copilot
Single brief → complete multi-format content package|Copilot
Series episode planner with continuity memory|
Thumbnail testing inside Loop before public release|
Alt-text generated strictly from real visual description|
Full content lineage and recycling tracking|
Automatic "why this failed" analysis after low Loop Score|Archive
Creator can lock a specific style for a campaign|
One-source multi-format export (9:16, 1:1, 16:9)|Editor
Built-in storyboard from script|
Voice tone matcher based on previous successful voiceovers|
Automatic chapter markers for longer content|
Visual energy curve for short-form content|
Safe-zone overlays for text and logos|Editor
One-click background removal + brand colour replacement|
Fully offline draft mode|
Personal prompt template library|
Content calendar that only surfaces proven formats|
Best time suggestions based on own past Loop data|
Mandatory rights checklist before publish|ReleaseGate
Automatic synthetic media labelling|Library
"Experimental – do not monetize" flag|
Long-form outline with attached research notes|
Automatic short-clip candidates from long videos|
Comedy timing suggestions based on past reactions|
Educational content structure templates|
Creator can mark any content as "core identity"|Library
Preferred emoji and hashtag memory|Emoji
Automatic detection of repeated ideas|
Private research workspace with required citations|
Content gap detection from personal history only|
Non-destructive multi-track timeline editor|Editor
Frame-accurate trim, split, and speed ramps|Editor
Fully editable style presets saved by creator|
Cinema, Shorts, Comedy, Educational, Podcast, Series presets|
Automatic scene and shot detection with labels|
Beat-sync suggestions from audio track|
Subtitle system keeping original language separate from translation|Audio
Burned-in subtitles with correct regional fonts|
Local voiceover with pronunciation and pacing controls|
Noise cleanup and silence detection|Audio
Audiogram generator from any audio|
Logo-safe zone enforcement|Editor
Fully versioned personal asset library|Library
Background removal and replacement|
Upscaling with quality report|
Motion graphics templates (lower thirds, counters, kinetic type)|
Image-to-motion tools (parallax, slow zoom, pan)|
Export only succeeds if file exists and passes validation|Editor
External editor export option|
Personal colour grade presets|
Freeze-frame and reaction zoom tools|
Multi-speaker angle switching for podcasts|
Automatic chapter and quote extraction|
Teaser auto-generation|
High-resolution export only when source supports it|
Watermark position memory|
Personal intro and outro library|
Licensed sound design suggestions|
Full waveform and volume automation|Audio
Unlimited undo/redo with history|Editor
Personal long-term Creator Memory Graph|Memory
Fan persona cards built from real Loop behaviour|
Style fingerprint updated after every successful Loop|
Permanent experiment tracker with learnings|Archive
Private "What worked for me" knowledge base|Memory
Automatic content gap detection from own history|
Seasonal and festival memory|
Research claims require citation and date|
Long-term trend of personal Loop Scores|Memory
Preferred caption length and style memory|
Best performing opening seconds library|
Failed idea archive with permanent reasons|Archive
Manual "this is my real voice" tagging|
Next experiment suggestions based on personal graph|
Cross-content theme detection|
Energy and mood tagging over time|Memory
Audience relationship quality score|
Learning retained even after content deletion|Archive
Private notes on any graph node|
Full graph export for personal backup|Memory
Permanent "never repeat this mistake" flag|Archive
Collaboration memory with editors|
Language preference memory per audience segment|
Relationship strength score with top fans|
Creator can manually correct any graph insight|Memory
Direct fan support inside Loops|
Creator-controlled paid Loop access|NewLoop
One-time tips on specific content|Earnings
Subscription to private series|
Digital product sales (guides, presets, templates)|Earnings
Exclusive early access for supporters|
Creator-defined tip jars with visible goals|
Transparent earnings dashboard|Earnings
Instant payout request with approval token|Payout
Creator-set minimum payout threshold|Settings
Basic tax document support|
Fan-to-creator gift credits|
Merch link attachment with tracking|
Live session ticket sales|Earnings
Private coaching slot booking|
Creator-controlled content licensing terms|
Limited edition digital assets|
Custom membership tiers designed by creator|
Earnings forecast based on personal history|
Cost of creation vs revenue tracker|
Automatic invoice generation for digital sales|
Creator-defined refund policy|
Multi-currency support with clear conversion|Settings
Ability to pause monetisation on any content|
Private fan lifetime value view|
Micro-funding for specific experiments|
Exclusive Loop for top supporters|
Platform fee shown before every transaction|Earnings
Creator can offer "name in credits" rewards|
Transparent revenue split when collaborators are involved|
Public release only after minimum Loop Score|ReleaseGate
One-time signed approval token required for every publish|ReleaseGate
Full publishing recovery states with proof|
Always-available manual export fallback|
Sequential public storytelling mode|
Creator-controlled visibility (public / unlisted / supporters only)|ReleaseGate
Different captions per distribution surface|
Auto-generated release notes from Loop insights|
Public content remains linked to original private learnings|
Ability to withdraw content while keeping private version|ReleaseGate
Release calendar limited to proven formats|
Soft launch to small public group first|
Complete publish history with approver identity|ReleaseGate
Mandatory rights confirmation checklist|ReleaseGate
Required synthetic media disclosure|ReleaseGate
Creator can set content expiration date|
One-click "archive from public but keep private"|ReleaseGate
Public comment moderation with approval|Trust
Fan can request content removal with reason|
Creator can restrict specific accounts from interacting|Trust
Only real metrics shown (no estimated reach)|Growth
Loop-to-public conversion rate|
Quality of engagement score|Growth
Cost per verified relationship|
Staleness indicators on every data point|Growth
Confidence labels on all numbers|Growth
Creator can hide any metric from public view|Trust
Platform admin moderation queue with reason codes|Admin
Full searchable audit log|Admin
Payout approval workflow for admins|Admin
System health and cost burn monitoring|Admin
Data export and deletion for any user|Admin
Configurable data retention policy|Admin
Feature flags and emergency kill switches|Admin
Honest "this feature is not ready" messaging on incomplete functions|Features`;
export const PRD: PrdFeature[] = L.split('\n').map((line, i) => { const [name, route] = line.split('|'); const n = i + 1; return { n, name, route: route || undefined, group: G.find(g => n >= g[1] && n <= g[2])![0] }; });
export const PRD_GROUPS = G.map(g => g[0]);
