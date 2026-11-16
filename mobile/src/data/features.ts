// The 150-feature VibeLoop social roadmap. "route" = a working screen exists in this build (on-device preview, no backend yet).
// No route = planned. Statuses are shown honestly in the app (PRD rule 200).
import type { IconName } from '../components/Icon';
export type Feature = { n: number; name: string; desc: string; icon: IconName; route?: string; moji: number; same?: number };
// Social features that are the SAME capability as a PRD feature (built once, linked — not duplicated).
export const SAME_AS_PRD: Record<number, number> = { 22: 82, 23: 84, 30: 50, 62: 42, 64: 97, 65: 89, 66: 87, 70: 6, 133: 185, 135: 183, 139: 197, 140: 197, 142: 186 };
export type FeatureSection = { key: string; title: string; sub: string; icon: IconName; color: string; features: Feature[] };
const RAW: [string, string, IconName, string, string[]][] = [
  ['home', 'Loop Home', 'home', '#6C3BFF', [
    'Loop Flow|Main personalized social feed|home|Explore', 'For You Vibes|Discover recommended content|spark|Explore', 'My Circle|Posts from accounts you follow|users|Explore',
    'Near Me Buzz|Public posts from nearby areas|pin|', 'Loop Trending|Popular public content|flame|Explore', 'Fresh Drops|Recently published posts|clock|Explore',
    'Interest Zone|Content grouped by interests|hash|Explore', 'World Window|Explore content from other regions|globe|', 'Mood Feed|Funny, inspiring, relaxing or emotional picks|smile|Explore', 'My Vault|Saved posts and collections|bookmark|Vault']],
  ['moments', 'Vibe Moments', 'image', '#FF3D9A', [
    'Moment Drop|Upload single or multiple photos|image|NewPost', 'Swipe Story|Photo carousel posts|layers|NewPost', 'Thought Drop|Text-only social posts|text|NewPost',
    'Vibe Canvas|Backgrounds, fonts and stickers for text posts|palette|NewPost', 'Frame Magic|Photo frames and layouts|library|', 'Mood Tags|Add emotional or activity tags|smile|NewPost',
    'Place Pin|Tag a location|pin|NewPost', 'Together Post|Collaborative posts|users|', 'Sound Moments|Add licensed music where available|music|', 'Memory Return|Reshare past moments|undo|']],
  ['motion', 'Vibe Motion', 'film', '#FF8A3D', [
    'Motion Drops|Vertical short videos|film|Motion', 'Quick Cut|Fast video trimming and editing|scissors|Editor', 'Cinema Vibe|Cinematic editing presets|spark|Create',
    'Loop Magic|Seamless looping videos|loops|', 'Duo Motion|Side-by-side reaction videos|layers|', 'Voice Drop|Voiceover-based videos|mic|Audio',
    'Talk Text|Animated video captions|text|Audio', 'Beat Sync|Match cuts with music beats|wave|', 'Motion Remix|Remix permitted creator videos|copy|', 'Hook First|Templates with strong opening hooks|bolt|Copilot']],
  ['sparks', 'Sparks', 'clock', '#C86BFF', [
    'Sparks|Temporary 24-hour stories|clock|Sparks', 'Close Circle|Private stories for selected followers|heart|Sparks', 'Spark Studio|Story editing with text, stickers and music|palette|',
    'Vote Spark|Interactive story polls|chart|Sparks', 'Ask Spark|Question-and-answer stickers|chat|', 'React Spark|VibeMoji reactions on stories|smile|Sparks',
    'Countdown Spark|Event countdowns|calendar|', 'Local Spark|Location-tagged stories|pin|', 'Link Spark|Share approved external links|link|', 'Forever Sparks|Permanent story highlights|star|Profile']],
  ['connect', 'Loop Connect', 'chat', '#14B88D', [
    'Loop Talk|Private direct messages|chat|Chats', 'Circle Chat|Group messaging|users|Chats', 'Voice Bubble|Voice messages|mic|',
    'Snap Reply|Photo and video replies|camera|', 'Quick React|VibeMoji message reactions|smile|Chats', 'Pin Talk|Pin important conversations|pin|Chats',
    'Chat Finder|Search messages|search|Search', 'Chat Vibes|Conversation themes|palette|', 'Quiet Mode|Mute conversations|bell|Chats', 'Safe Inbox|Message requests, blocking and reporting|shield|Trust']],
  ['identity', 'Loop Identity', 'user', '#2B7BF0', [
    'My Space|Custom profile page|user|Profile', 'Vibe Circle|Followers and following|users|Profile', 'Vibe Bio|Personalized biography|text|Profile',
    'Link Shelf|Multiple profile links|link|', 'Profile Mood|Temporary status or mood|smile|Profile', 'Cover Space|Profile banner|image|Profile',
    'Creator Pulse|Creator profile insights|chart|Growth', 'Creator Badge|Verified or earned creator labels|star|', 'Content Shelf|Organize posts and videos|library|Library', 'Private Space|Private profile controls|lock|Trust']],
  ['creator', 'Creator Studio', 'wand', '#6C3BFF', [
    'Creator Lab|Unified creator dashboard|home|Home', 'Hook Forge|Engaging hooks from your own winners|bolt|Copilot', 'Poster Craft|Create social graphics|palette|',
    'Image Motion|Turn still images into motion|film|', 'Voice Craft|Multilingual voiceovers|mic|Audio', 'Language Flip|Translate into Indian languages|globe|Audio',
    'Reel Factory|Produce short-form videos|film|Editor', 'Creator Calendar|Schedule content|calendar|', 'Growth Pulse|Reach and engagement analytics|chart|Growth', 'Content Battle|Compare creative variations (A/B Loops)|layers|Loops']],
  ['local', 'Loop Local', 'pin', '#FF3D9A', [
    'Desi Vibes|Discover Indian regional content|spark|Explore', 'Namma Voice|Natural regional-language content|chat|', 'City Pulse|City-specific content feed|pin|',
    'Area Circle|Neighborhood communities|users|Tribes', 'Festival Flow|Regional festival content|gift|', 'Foodie Streets|Discover local food creators|flame|Tribes',
    'Campus Buzz|College and campus communities|book|Tribes', 'Match Vibes|Sports fan conversations|trophy|Tribes', 'City Stories|Local travel and lifestyle posts|globe|', 'Local Talent|Spotlight regional creators|star|']],
  ['expression', 'Vibe Expression', 'smile', '#FFA62E', [
    'Vibe Hearts|Standard like reaction|heart|Emoji', 'Heat Wave|Excitement reaction|flame|Emoji', 'Giggle Burst|Funny content reaction|smile|Emoji',
    'Soft Spot|Emotional reaction|heart|Emoji', 'Big Applause|Appreciation reaction|star|Emoji', 'Mind Pop|Surprise reaction|spark|Emoji',
    'Reaction Pack|Custom VibeMoji collections|library|Emoji', 'Vibe Stickies|500 original VibeMoji stickers|smile|Emoji', 'Festival Stickies|Indian festival sticker sets|gift|', 'Emoji Trails|Animated reaction effects|wave|']],
  ['live', 'Loop Live', 'live', '#FF4D5E', [
    'Loop Live|Real-time video broadcasting|live|Live', 'Live Together|Multi-host live sessions|users|', 'Live Talk|Live comments|chat|Live',
    'Live Hearts|Real-time reactions|heart|Live', 'Live Questions|Audience questions|chat|', 'Live Vote|Polls during broadcasts|chart|',
    'Live Countdown|Scheduled live announcements|calendar|Live', 'Audio Room|Live audio discussions|mic|', 'Live Replay|Save permitted recordings|play|', 'Live Shield|Moderation, reporting and host controls|shield|']],
  ['tribes', 'Loop Tribes', 'users', '#14B88D', [
    'Loop Tribes|Interest-based groups|users|Tribes', 'City Tribes|City communities|pin|Tribes', 'Food Tribes|Food discussion groups|flame|Tribes',
    'Gaming Tribes|Gaming communities|star|Tribes', 'Creative Tribes|Art and design communities|palette|Tribes', 'Student Tribes|Student groups|book|Tribes',
    'Tribe Board|Community announcements|flag|', 'Tribe Events|Group events|calendar|', 'Tribe Polls|Community voting|chart|', 'Tribe Guard|Group moderation tools|shield|']],
  ['originals', 'Loop Originals', 'spark', '#C86BFF', [
    'Secret Cheer|Private appreciation with abuse controls|heart|', 'Story Chain|Friends continue a shared visual story|link|', 'Mood Match|Find content matching a mood|smile|Explore',
    '60-Second Fame|Rotating spotlight for emerging creators|clock|', 'Color Day|Daily color-themed challenges|palette|', 'Voice Moments|Audio-first social posts|mic|',
    'One Question|A daily community prompt|chat|Explore', 'Creator Relay|Collaborative content chains|loops|', 'Memory Box|Private collections of moments|archive|Vault', 'First 100 Club|Recognition for earliest supporters|trophy|']],
  ['business', 'Loop Business', 'shop', '#FF8A3D', [
    'Brand Space|Business profile pages|shop|', 'Brand Drops|Product and service announcements|send|', 'Showcase Motion|Short product videos|film|',
    'Shop Shelf|Product catalogs with supported links|shop|', 'Local Business Buzz|Discover nearby businesses|pin|', 'Business Talk|Customer enquiries|chat|',
    'Loop Boost|Sponsored post campaigns (labelled)|bolt|', 'Business Pulse|Business performance insights|chart|', 'Creator Connect|Brand × creator collaborations|users|', 'Campaign Planner|Marketing campaign scheduling|calendar|']],
  ['trust', 'Loop Trust', 'shield', '#120F24', [
    'Privacy Lock|Account visibility settings|lock|Trust', 'Block Shield|Block unwanted accounts|close|Trust', 'Quiet Restrict|Restrict unwanted interactions|eye|Trust',
    'Report Hub|Report harmful content|flag|Trust', 'Comment Guard|Comment filtering and moderation|shield|Trust', 'Teen Space|Age-appropriate protections|user|Trust',
    'Identity Check|Optional identity verification|fingerprint|', 'Secure Login|Passkeys or multi-factor authentication|lock|Settings', 'Data Vault|Download account data|download|Settings', 'Account Control|Deactivate or delete an account|trash|Settings']],
  ['growth', 'Loop Growth', 'chart', '#2B7BF0', [
    'Pulse Board|Creator analytics dashboard|chart|Growth', 'View Meter|Video and post views|eye|Growth', 'Heart Count|Likes and reactions|heart|Growth',
    'Share Trail|Shares and repost insights|send|Growth', 'Circle Growth|Follower trends|users|Growth', 'Active Hours|Audience activity insights|clock|Growth',
    'Audience Map|Aggregated audience geography|globe|', 'Engagement Pulse|Engagement performance|bolt|Growth', 'Top Drops|Best-performing posts|trophy|Growth', 'Growth Journey|Historical performance reports|graph|Growth']],
];
const SUBS: Record<string, string> = { home: 'Feed & discovery', moments: 'Posts & photos', motion: 'Short videos', sparks: 'Stories & status', connect: 'Chat & messaging', identity: 'Profiles & followers', creator: 'Creator tools', local: 'India-first social', expression: 'VibeMoji, stickers & reactions', live: 'Streaming & events', tribes: 'Groups & communities', originals: 'Only on VibeLoop', business: 'Shops & brands', trust: 'Privacy & safety', growth: 'Analytics & engagement' };
let n = 0;
export const SECTIONS: FeatureSection[] = RAW.map(([key, title, icon, color, list]) => ({
  key, title, icon, color, sub: SUBS[key],
  features: list.map(s => { const [name, desc, ic, route] = s.split('|'); n++; return { n, name, desc, icon: ic as IconName, route: route || undefined, moji: (n * 37) % 500 + 1, same: SAME_AS_PRD[n] }; }),
}));
export const ALL_FEATURES = SECTIONS.flatMap(s => s.features);
