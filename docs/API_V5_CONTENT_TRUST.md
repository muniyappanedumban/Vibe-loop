# v5 — Content hub (CMS), reviews, Speak Up reports (contract)

Unique names (Gen-Z): Help → **Help Hub** · Contact → **Hit Us Up** · Terms → **House Rules** · Privacy → **Privacy Promise** · Data collected → **Data Receipt** · About → **Our Story** · Emergency → **SOS Lane** · Instructions → **Glow Guide** / **Hush Guide** · Blog → **The Loopdown** (Glow) / **Hush Notes** (Hush) · News → **Fresh Wire** · App links → **Get the Apps** · Creator/collab reviews → **Vouches** · Product reviews → **Real Talk** · Reports → **Speak Up**.

## CMS pages (admin-managed, per module)
Page: {slug, module: "glow"|"hush"|"both", kind: "page"|"faq"|"blog"|"news"|"guide"|"links", title, summary, body (plain text with simple markdown: #, ##, -, **bold**, [text](url)), coverUrl?, items? (faq: [{q,a}] | links: [{label, url, platform:"android"|"ios"|"web"|"other"}] | contacts: [{label, value, type:"email"|"phone"|"url"}]), published, order, updatedAt, version}.
- `GET /pages?module=glow|hush&kind=` (published only; module "both" included) · `GET /pages/{slug}` · `GET /pages/{slug}/versions` (admin)
- Admin: `GET /admin/pages`, `POST /admin/pages`, `PATCH /admin/pages/{slug}` (bumps version, keeps history), `DELETE /admin/pages/{slug}`, publish toggle.
- Seed (labelled drafts where legal): help-hub (faq, both), hit-us-up (contacts: support@vibeloop.app placeholder clearly marked "replace", in-app ticket), house-rules (terms draft), privacy-promise (privacy draft), data-receipt (exact list of data the app actually stores: email, @ID/handle, display name, profile photos/bios, posts/messages/files you create, location ONLY when you tag a place, reactions/follows, IP + device info in short-lived security logs for rate limiting, payment order ids from providers — no card data; retention & deletion request path), our-story (about), sos-lane (India: 112 emergency, 1930 cyber crime helpline, 181 women helpline; "If you're in danger call 112"; in-app Speak Up), glow-guide & hush-guide (instructions), get-the-apps (links; on/off via feature `appLinks`), 2 Loopdown posts, 1 Hush Notes post, 2 Fresh Wire news items.
- Features (config, admin on/off): `blog`, `news`, `appLinks`, `reviews`, `productReviews`, `vouches`, `speakUp` (default true except productReviews true only when money.store on).

## Reviews
- Vouch (creator/collab review): `POST /vouches` {userId, rating 1..5, text≤500, context:"collab"|"creator"} — only if you have interacted (friends, collab post together, or bought from them); one per pair (update allowed). `GET /users/{id}/vouches`.
- Real Talk (product review): `POST /store/products/{id}/reviews` {rating, text} — only for buyers with a PAID order (verifiedPurchase=true) or free-product claimers; `GET /store/products/{id}/reviews` → {avg, count, items}.
- Admin: `GET /admin/reviews?type=&status=`, `PATCH /admin/reviews/{id}` {status: visible|hidden}, `DELETE /admin/reviews/{id}`; feature switches above hide all review UI/API (403) when off.

## Speak Up (reports & tickets)
- `POST /speakup` {category: "harassment"|"violation"|"complaint"|"collab_dispute"|"scam"|"impersonation"|"self_harm"|"other", targetType: "user"|"post"|"message"|"product"|"hood"|"none", targetId?, details≤2000, evidence?: [mediaUrl], urgent?: bool} → {id, ticket: "SU-XXXXX", status:"open"}. self_harm or urgent=true → priority "urgent" and response includes SOS Lane info.
- `GET /speakup/mine` (status updates). Admin: `GET /admin/speakup?status=&category=&priority=`, `PATCH /admin/speakup/{id}` {status: open|reviewing|actioned|closed, note, action?: "warn"|"remove_content"|"suspend_user"} (audit + notice to reporter).
- "Hit Us Up" contact form → `POST /speakup` with category "complaint" & targetType "none".

## Implementation notes & deviations (v5 build)
- **Extra endpoints:** `GET /admin/pages/{slug}`, `POST /admin/pages/{slug}/publish` {published}, `POST /admin/pages/{slug}/restore` {version} (restore = new version with the old content; publish state is kept), `GET /admin/speakup/{id}`. `PATCH /admin/pages/{slug}` also accepts `published` and a `note` (shown in history).
- **Items:** stored with an explicit `itemsKind` (`faq|links|contacts`) since a `page` can carry contacts (Hit Us Up, SOS Lane). Contacts `type` also allows `ticket`; links have an optional `note` (e.g. iOS "Coming soon" has an empty url).
- **Feature gating:** blog/news/links kinds off → omitted from `/pages` (and `[]` when that kind is requested), `/pages/{slug}` → 403. `reviews` is a master switch over `vouches` and `productReviews`; Real Talk additionally requires `money` + `store` on (so it's off by default, matching the money defaults). `speakUp` off → 403 (including urgent reports — the SOS Lane page stays readable).
- **Vouch interaction** = friends, a Drop with `collab` naming the other person (either direction), or a paid order / free claim from that creator. Blocked pairs → 403.
- **Free claims** are recorded in a new `store_claims` table (no payment Order is created, so v3 semantics hold); claimers' Real Talk has `verifiedPurchase:false`.
- **Speak Up priority:** urgent (self_harm or urgent=true) · high (harassment, scam, impersonation) · normal. Non-urgent reports are capped at 20/day per user (429). Ticket `history` keeps staff notes/actions; the reporter sees only `updates` (public messages). An action without a status sets `actioned`. `suspend_user` also bumps token_version (signs out); staff accounts can't be suspended here. `remove_content` hides posts, deletes messages, unlists products, suspends Hoods.
- **Seed:** product `prd_presets` renamed to `prod_u1_presets`; demo paid order `ord_demo_m3_presets` (note "demo order (seed)") — Cash Flow income now excludes orders whose note starts with "demo". Two existing v3 test assertions were updated for this (product id; order count excludes the demo order).
- Migration `c3b719498aa5` (pages, page_versions, reviews, speakup_tickets, store_claims).
