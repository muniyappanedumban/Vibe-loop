# v3 — Money (admin-switchable), store, providers, video (contract)

Everything money-related is OFF unless the admin turns it on (config `features.*` + kv). When off, the app hides the UI entirely and the API returns 403 "Not enabled".
Currency: INR first. Prices are stored in paise (integer). Country pricing table overrides INR per ISO2 (e.g. US → USD cents). Never invent prices: plans/products only exist if admin/creator created them.

## Feature flags (in /app-config `features`, admin-controlled per layer)
`money` (master), `subscriptions`, `store`, `tips`, `ads`, `platformFees`. App shows a module only when `money && <flag>`.

## Public/app endpoints (Bearer)
- `GET /money/plans` → [{id, name, perks:[str], period:"month"|"year", price:{amount, currency, display:"₹99"}}] resolved for caller country. 403 if off.
- `POST /money/subscribe` {planId, provider:"razorpay"|"cashfree"} → {orderId, status:"created", payUrl|null, provider, testMode, message} — payUrl is the provider's hosted payment link (open in browser). If provider keys missing → 409 "Payments not configured by admin" (no fake success).
- `GET /money/me` → {subscription:{planId,status,renewsAt}|null, income:{tips, store, subs, fees, net}, orders:[...]}
- `GET /store` (?creator=) → products [{id, creatorId, title, desc, price{amount,currency,display}, mediaUrl, kind:"digital"|"physical", stock|null, active}] ; `POST /store/products` (creator) ; `PATCH /store/products/{id}` ; `POST /store/orders` {productId, provider} → same shape as subscribe.
- `POST /money/tips` {to:userId, amount(paise), provider, note} → payment link.
- Webhooks: `POST /webhooks/razorpay` (verify `X-Razorpay-Signature` HMAC-SHA256 with webhook secret), `POST /webhooks/cashfree` (verify `x-webhook-signature` = base64 HMAC-SHA256 of timestamp+body). Only verified webhooks mark orders paid; platform fee recorded at that point.
- `GET /ads/slot?place=feed|explore|chat_list` → {ad:{id,title,body,cta,url,sponsor}|null} — only when ads on for caller's slab/zone; ads are labelled "Sponsored". Admin-created ads only.
- Media: `POST /media` also accepts video (mp4/mov/webm by magic bytes) up to 50 MB; returns {url, mime, kind:"image"|"video"}.
- OTP delivery: if MSG91 configured (and enabled) send email/SMS via MSG91 API; else demo code (existing behaviour). Phone numbers are NEVER required — MSG91 email template or provider-agnostic email OTP.

## Admin (owner)
- `GET/PUT /admin/money/settings` {money, subscriptions, store, tips, ads, platformFees, feePercent, minPayout, currency:"INR"} (also mirrors into config base features)
- `GET/PUT /admin/money/plans` CRUD with `prices: {"IN": 9900, "US": 199, ...}` (minor units, currency per country table)
- `GET/PUT /admin/money/country-pricing` {"IN":{"currency":"INR","symbol":"₹"},"US":{"currency":"USD","symbol":"$"},...}
- `GET/PUT /admin/ads` ads CRUD + `GET/PUT /admin/ads/slabs` {slabKey: {enabled, places:[...], frequency}}
- `GET /admin/money/income` → platform income: fees, subs, ads (counts real paid orders only), by day
- `GET /admin/store` products/orders moderation; `PATCH /admin/store/products/{id}` {active}
- `GET/PUT /admin/integrations` → razorpay {mode:test|live, keyId, keySecret*, webhookSecret*}, cashfree {mode, appId, secretKey*, webhookSecret*}, msg91 {mode, authKey*, templateId, sender}, maps {provider:"google"|"mapbox", key*}. Secrets (*) encrypted at rest (Fernet, key from env MASTER_KEY), never returned (masked "••••last4"). `POST /admin/integrations/{name}/test` performs a real lightweight API call when keys exist, else "not configured".
