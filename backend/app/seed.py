"""Create tables and load labelled demo data. Usage: python -m app.seed [--reset]"""
import sys, time
from .db import engine, SessionLocal, Base
from . import models as M
from .security import hash_password
H, D = 3600_000, 86_400_000
DEMO_PASSWORD = "Vibeloop2026"  # dev-only seed credential, documented in README; change in any shared environment

def run(reset=False):
    if reset: Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    if db.get(M.User, "usr_riya"): print("already seeded"); return
    t = int(time.time() * 1000); pw = hash_password(DEMO_PASSWORD)
    U = lambda id, email, handle, name, role, hue=280, **k: M.User(id=id, email=email, handle=handle, name=name, role=role, hue=hue, password_hash=pw, verified=True, **k)
    db.add_all([
        U("usr_admin", "admin@vibeloop.app", "@vibeloop.staff", "VibeLoop Staff", "owner", 250),
        U("usr_riya", "riya@vibeloop.app", "@riya.makes", "Riya Kapoor", "creator", 280, bio="Comedy shorts about office chai life · testing everything in Loops first",
          created_at=t - 400 * D, settings={"minPayout": 500, "currency": "INR"}, social={"privacy": {"privateAccount": False, "teenSpace": False, "hideLikes": False, "commentGuard": True, "guardWords": ["spam", "fake followers"], "msgRequests": True}, "reactionPack": [7, 42, 118, 203, 77, 311], "profileMood": 118}),
    ])
    creators = [("u1", "Aanya Rao", "@aanya.eats", 20, "Bengaluru", True, "Street food, one plate at a time"), ("u2", "Kabir Shah", "@kabir.frames", 260, "Mumbai", False, "Cinematic city walks"),
                ("u3", "Meera Iyer", "@meera.learns", 160, "Chennai", True, "Finance, explained simply"), ("u4", "Zoya Khan", "@zoya.draws", 320, "Hyderabad", False, "Illustrator · color days"),
                ("u5", "Rohan Das", "@rohan.plays", 200, "Kolkata", False, "Cricket takes & gaming"), ("u6", "Tara Menon", "@tara.trails", 120, "Kochi", False, "Slow travel across India")]
    for id, n, h, hue, city, badge, bio in creators: db.add(U(id, f"{id}@demo.vibeloop.app", h, n, "creator", hue, city=city, badge=badge, bio=bio))
    fans = ["Aanya", "Kabir", "Meera", "Rohan", "Zoya", "Ishaan", "Tara", "Dev", "Nila", "Arjun", "Sana", "Vihaan"]
    for i, n in enumerate(fans): db.add(U(f"m{i}", f"fan{i}@demo.vibeloop.app", f"@{n.lower()}.fan", n, "fan", (i * 37) % 360, created_at=t - (20 - i) * D))
    db.flush()
    mem = lambda a, b: [{"id": f"m{i}", "name": fans[i], "hue": (i * 37) % 360, "joinedAt": t - (20 - i) * D} for i in range(a, b)]
    o1, o2, o3 = t - 5 * H, t - 4 * D, t - 9 * D
    db.add_all([
        M.Loop(id="l1", owner_id="usr_riya", title="Chai-break comedy · Ep 4", template="Comedy short", size_limit=20, min_score=70, opened_at=o1, members=mem(0, 10), notes=["Try the cold open from Ep 2"], demo=True,
               dna={"mood": "Playful", "energy": 82, "depth": 35, "pace": 76}, drafts=[
                   {"version": "A", "title": "Cold open: spilled chai", "hook": "POV: your boss walks in mid-sip", "caption": "Monday mood, but make it chai", "hue": 265, "durationSec": 34, "synthetic": False},
                   {"version": "B", "title": "Slow build + punchline", "hook": "Three types of office chai drinkers", "caption": "Which one are you?", "hue": 330, "durationSec": 41, "synthetic": False}]),
        M.Loop(id="l2", owner_id="usr_riya", title="Budget travel: Hampi in ₹3k", template="Educational", size_limit=30, min_score=65, opened_at=o2, members=mem(2, 12), status="released", demo=True,
               dna={"mood": "Curious", "energy": 58, "depth": 80, "pace": 52}, drafts=[{"version": "A", "title": "Map-first walkthrough", "hook": "₹3,000. Two days. One stunning ruin town.", "caption": "Save this for your next trip", "hue": 160, "durationSec": 58, "synthetic": False}]),
        M.Loop(id="l3", owner_id="usr_riya", title="Desk setup tour v1", template="Lifestyle", size_limit=15, min_score=70, opened_at=o3, members=mem(0, 8), status="archived", notes=["Never again: 60s+ tours"], demo=True,
               fail_reason='Score 31 < 70. Pacing: "slow", "boring" mentioned by 3 members.', dna={"mood": "Calm", "energy": 30, "depth": 40, "pace": 25},
               drafts=[{"version": "A", "title": "Full room pan", "hook": "My desk setup for 2026", "caption": "Links in bio", "hue": 210, "durationSec": 72, "synthetic": False}]),
    ])
    R = lambda lid, op, rows: [M.Reaction(loop_id=lid, member_id=f"m{m}", version=v, kind=k, text=tx, at=op + int(h * H)) for m, v, k, tx, h in rows]
    db.add_all(R("l1", o1, [(0, "A", "share", "So relatable, sending to my team", .5), (1, "A", "forme", "This is literally me lol great timing", 1), (2, "B", "work", "Punchline lands late, feels slow", 1.4), (3, "A", "share", "Love the cold open", 2), (4, "B", "skip", "Too long for a short", 2.5), (5, "A", "work", "Audio a bit loud at the start", 3), (6, "B", "share", "Fresh idea", 3.6)])
               + R("l2", o2, [(2, "A", "share", "Super useful, clear breakdown", 1), (3, "A", "share", "Saving this, best budget guide", 2), (4, "A", "forme", "Exactly what I needed", 3), (5, "A", "work", "Add bus timings", 4), (6, "A", "share", "Clear and fresh", 6), (7, "A", "share", "wow great shots", 8)])
               + R("l3", o3, [(0, "A", "skip", "Slow and boring start", 1), (1, "A", "work", "Too long, cut to the gear", 2), (2, "A", "skip", "Seen this format a lot", 3), (3, "A", "work", "Lighting is nice but slow", 4), (4, "A", "share", "Nice lamp", 5)]))
    db.add(M.Publish(loop_id="l2", visibility="public", approver="@riya.makes", token_id="apr_seed", at=t - 3 * D))
    for i, (k, f, g, h) in enumerate([("tip", "Meera", 150, 2 * H), ("paid_loop", "Kabir", 99, D), ("product", "Zoya", 499, 2 * D), ("membership", "Arjun", 199, 3 * D), ("ticket", "Tara", 299, 6 * D), ("tip", "Dev", 50, 8 * D)]):
        db.add(M.Txn(id=f"t{i+1}", creator_id="usr_riya", kind=k, from_name=f, gross=g, fee=round(g * 0.08), at=t - h, demo=True))
    for id, title, kind, hue, syn, core, vs in [("a1", "Chai cold open", "video", 265, False, True, ["Original upload", "Trimmed 3s", "Audio cleanup"]), ("a2", "Hampi drone b-roll", "video", 160, False, False, ["Original upload"]),
                                                ("a3", "Voiceover — travel", "audio", 30, False, False, ["Recorded", "Noise cleanup"]), ("a4", "Thumbnail concept", "image", 320, True, False, ["Generated · labelled synthetic"]), ("a5", "Ep 5 script", "script", 200, False, False, ["Draft"])]:
        db.add(M.Asset(id=id, owner_id="usr_riya", title=title, kind=kind, hue=hue, synthetic=syn, core_identity=core, versions=[{"v": i + 1, "at": t - (len(vs) - i) * D, "note": n} for i, n in enumerate(vs)]))
    for id, tx, src in [("i1", "Cold opens under 3s beat slow builds for your comedy shorts.", "Loops l1, l3"), ("i2", "Your audience saves practical, numbers-first travel guides.", "Loop l2"), ("i3", 'Videos over 60s get "slow"/"long" feedback from your Loop.', "Loop l3")]:
        db.add(M.Insight(id=id, owner_id="usr_riya", text=tx, source=src))
    db.add_all([M.Notice(user_id="usr_riya", kind="approval", title="Publish approval waiting", body="Hampi in ₹3k is ready for public release gate", route="ReleaseGate", params={"id": "l2"}, at=t - 3 * H),
                M.Notice(user_id="usr_riya", kind="earning", title="Meera sent a ₹150 tip", body="On “Chai-break comedy · Ep 4”", route="Earnings", at=t - 2 * H),
                M.Notice(user_id="usr_riya", kind="system", title="Voice tone matcher", body="Not ready yet — we will tell you when it is.", read=True, at=t - D)])
    P = lambda id, by, kind, text, hue, mood, interest, h, **k: M.Post(id=id, author_id=by, kind=kind, text=text, hue=hue, mood=mood, interest=interest, at=t - h * H, shares=4 + h, views=900 + h * 140,
                                                                       seed_reactions={"heart": 40 + h * 3, "fire": 12 + h, "laugh": 30 if mood == "Funny" else 2, "touch": 5, "clap": 9, "boom": 3}, **k)
    db.add_all([P("p1", "u1", "photo", "Benne dosa at 7am hits different. Tag your breakfast buddy.", 25, "Happy", "Food", 1, place="VV Puram, Bengaluru"),
                P("p2", "u2", "motion", "Marine Drive at golden hour — one take, no cuts.", 230, "Relaxing", "Travel", 2),
                P("p3", "u3", "carousel", "5 money habits I wish I had at 22 (swipe →)", 150, "Inspiring", "Finance", 3, slides=5),
                P("p4", "u4", "thought", "Today's Color Day is MANGO. Show me something yellow", 45, "Inspiring", "Art", 4, bg="#FFC23D"),
                P("p5", "u5", "motion", "When the last-ball six actually happens", 200, "Funny", "Sports", 5),
                P("p6", "u6", "photo", "Backwaters before the tourists wake up.", 130, "Relaxing", "Travel", 7, place="Alleppey"),
                P("p7", "u1", "motion", "Rating every chaat stall on one street", 10, "Funny", "Food", 9),
                P("p8", "u3", "thought", "One Question: what's the best advice you got about money?", 280, "Emotional", "Finance", 12, bg="#6C3BFF")])
    db.flush()
    db.add_all([M.Comment(post_id=p, by=b, text=x) for p in ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"] for b, x in [("u3", "Love this!"), ("u5", "Saving it")]])
    db.add_all([M.Spark(id="s1", author_id="u1", hue=30, text="New stall alert in Jayanagar", at=t - 2 * H, poll={"q": "Dosa or idli?", "a": "Dosa", "b": "Idli", "va": 64, "vb": 31}),
                M.Spark(id="s2", author_id="u4", hue=320, text="WIP for Color Day", at=t - 3 * H, close=True), M.Spark(id="s3", author_id="u6", hue=120, text="Sunrise in Munnar", at=t - 5 * H),
                M.Spark(id="s4", author_id="u2", hue=250, text="Shooting a night walk tonight", at=t - 6 * H),
                M.Spark(id="s5", author_id="u5", hue=200, text="Match day mood", at=t - 8 * H, poll={"q": "Who wins?", "a": "Home", "b": "Away", "va": 120, "vb": 98})])
    db.add(U("x1", "promo@demo.vibeloop.app", "@promo.deals", "Promo Deals", "fan", 0))
    db.add_all([M.Chat(id="c1", title="Aanya Rao", members=["usr_riya", "u1"], state={"usr_riya": {"pinned": True}}), M.Chat(id="c2", title="Creator Relay · Ep chain", group=True, members=["usr_riya", "u2", "u4", "u6"]),
                M.Chat(id="c3", title="Meera Iyer", members=["usr_riya", "u3"], state={"usr_riya": {"muted": True}}), M.Chat(id="c4", title="Unknown · @promo.deals", members=["usr_riya", "x1"], state={"usr_riya": {"request": True}})])
    db.flush()
    db.add_all([M.Message(chat_id="c1", sender="u1", text="Your chai episode had me crying", at=t - 50 * 60000), M.Message(chat_id="c1", sender="usr_riya", text="Haha thank you! Collab on a food ep?", at=t - 40 * 60000),
                M.Message(chat_id="c1", sender="u1", text="Yes!! Saturday?", at=t - 30 * 60000), M.Message(chat_id="c2", sender="u4", text="I posted part 3, who's next?", at=t - 2 * H),
                M.Message(chat_id="c3", sender="u3", text="Sent you the SIP explainer script", at=t - D), M.Message(chat_id="c4", sender="x1", text="Want 10k followers fast?", at=t - 3 * H)])
    db.add_all([M.Tribe(id=a, name=b, kind=c, members=d, hue=e, desc=f) for a, b, c, d, e, f in [("t1", "Bengaluru Foodies", "Food", 4820, 25, "Darshinis, dosas and late-night biryani"), ("t2", "Mumbai City Walkers", "City", 3110, 230, "Heritage walks every Sunday"),
                ("t3", "Indie Game Devs India", "Gaming", 1980, 280, "Ship small games, together"), ("t4", "Color Day Artists", "Creative", 2640, 330, "A daily color challenge"), ("t5", "IIT-M Campus Buzz", "Student", 1450, 170, "Fests, notes and memes"), ("t6", "Cricket Couch Crew", "Sports", 6730, 200, "Ball-by-ball banter")]])
    db.add_all([M.LiveEvent(id="v1", author_id="u3", title="Budgeting Q&A for first jobbers", at=t + 2 * H, hue=160), M.LiveEvent(id="v2", author_id="u1", title="Street food crawl — Live Together", at=t + 26 * H, hue=25), M.LiveEvent(id="v3", author_id="u4", title="Color Day live sketch", at=t + 50 * H, hue=320)])
    db.add_all([M.Edge(user_id="usr_riya", kind="follow", target=x) for x in ["u1", "u3", "u4"]] + [M.Edge(user_id="usr_riya", kind="save", target="p3"), M.Edge(user_id="usr_riya", kind="join", target="t1")])
    db.add_all([M.Report(reporter_id="u3", target="p5", reason="Spam"), M.Report(reporter_id="u1", target="x1", reason="Spam message request")])
    db.add(M.Payout(creator_id="usr_riya", amount=500, status="pending_review", token_id="apr_seed2", at=t - 20 * H))
    for k in ["publishing", "payouts", "ai_generation", "signups", "chat", "social", "otp"]: db.add(M.KV(ns="kill", key=k, value={"on": False}))
    seed_v2(db, t)
    seed_v3(db, t)
    db.add(M.Audit(actor="system", action="seed", detail="demo data loaded"))
    db.commit(); print("seeded. demo logins: riya@vibeloop.app / admin@vibeloop.app, password", DEMO_PASSWORD)

def seed_v2(db, t):
    """v2: multi-account, chat world, towns, statuses, server-driven config."""
    from .config_seed import LAYERS
    from .config_resolver import DEFAULT_ZONES, DEFAULT_SLABS, DEFAULT_LANGS
    MIN = 60_000
    db.add(M.User(id="usr_riya_chat", email="riya@vibeloop.app", handle="@riya.chats", name="Riya (Chat)", role="creator", hue=300, verified=True,
                  password_hash="!otp-only", created_at=t - 100 * D, profile={"chat_bio": "Chat-only account · DMs open for collabs", "mood": 42}))
    db.get(M.User, "usr_riya").profile = {"chat_bio": "Chai, comedy & Coimbatore", "mood": 118, "country": "IN", "lang": "en"}
    for uid, bio in [("u1", "Dosa diaries"), ("u3", "Ask me about SIPs"), ("u4", "Drawing every day"), ("u6", "On a train somewhere")]:
        db.get(M.User, uid).profile = {"chat_bio": bio}
    F = lambda a, b, since, close=False, bestie=False: [M.Friend(user_id=a, friend_id=b, close=close, bestie=bestie, since=since), M.Friend(user_id=b, friend_id=a, since=since)]
    db.add_all(F("usr_riya", "u1", t - 300 * D, close=True, bestie=True) + F("usr_riya", "u3", t - 200 * D, close=True) + F("usr_riya", "u4", t - 90 * D) + F("usr_riya", "u6", t - 30 * D)
               + F("u1", "u4", t - 50 * D) + F("u4", "u6", t - 40 * D) + F("u1", "u6", t - 20 * D))
    db.add_all([M.FriendRequest(id="fr_u5", from_id="u5", to_id="usr_riya", at=t - 4 * H), M.FriendRequest(id="fr_u2", from_id="usr_riya", to_id="u2", at=t - 26 * H)])
    db.add_all([M.Conv(id="cv_u1", members=["usr_riya", "u1"], created_by="u1", at=t - 10 * D, state={"usr_riya": {"pinned": True, "folder": "friends", "lastRead": t - 45 * MIN}, "u1": {"folder": "friends"}}),
                M.Conv(id="cv_u3", members=["usr_riya", "u3"], created_by="usr_riya", at=t - 8 * D, state={"usr_riya": {"folder": "work", "lastRead": t}, "u3": {}}),
                M.Conv(id="cv_weekend", title="Weekend Plan", group=True, members=["usr_riya", "u1", "u4", "u6"], created_by="u4", at=t - 3 * D,
                       state={"usr_riya": {"folder": "groups", "lastRead": t - 3 * H}, "u1": {"folder": "groups"}, "u4": {}, "u6": {}}),
                M.Conv(id="cv_x1", members=["x1", "usr_riya"], created_by="x1", at=t - 3 * H, state={"x1": {}, "usr_riya": {"request": True}})])
    db.flush()
    C = lambda id, cv, by, text, ago, **k: M.ChatMsg(id=id, conv_id=cv, sender=by, text=text, at=t - ago, **k)
    db.add_all([
        C("cm_a1", "cv_u1", "u1", "Your chai episode had me crying ", 60 * MIN, reactions=[{"moji": 7, "by": "usr_riya"}]),
        C("cm_a2", "cv_u1", "usr_riya", "Haha thank you! Collab on a food ep?", 55 * MIN, starred_by=["usr_riya"]),
        C("cm_a3", "cv_u1", "u1", "Yes!! Saturday? I know a benne dosa place", 50 * MIN, reply_to="cm_a2", pinned=True),
        C("cm_a4", "cv_u1", "usr_riya", "Saturday 8am, I'll bring the camera", 46 * MIN, reply_to="cm_a3"),
        C("cm_a5", "cv_u1", "u1", "Deal. Sending the location soon", 30 * MIN),
        C("cm_a6", "cv_u1", "u1", "", 20 * MIN, kind="post", ref={"type": "post", "id": "p1", "title": "Benne dosa at 7am hits different. Tag your breakfast buddy.", "hue": 25}),
        C("cm_m1", "cv_u3", "u3", "Sent you the SIP explainer script", D, starred_by=["usr_riya"]),
        C("cm_m2", "cv_u3", "usr_riya", "Reading it tonight — the hook is great", D - 2 * H, pinned=True),
        C("cm_m3", "cv_u3", "u3", "Cool, tell me if the numbers part drags", D - 3 * H, reply_to="cm_m2"),
        C("cm_g1", "cv_weekend", "u4", "Okay team, Saturday plan?", 5 * H),
        C("cm_g2", "cv_weekend", "u4", "", 4 * H + 50 * MIN, kind="poll", poll={"q": "Where do we go Saturday?", "options": [{"text": "Isha Yoga Center", "votes": 2}, {"text": "Kovai Kondattam", "votes": 1}, {"text": "Brookefields Mall", "votes": 0}],
                                                                       "voters": {"u4": 0, "u6": 0, "u1": 1}}),
        C("cm_g3", "cv_weekend", "u6", "I'm in either way, bringing snacks", 4 * H),
        C("cm_g4", "cv_weekend", "u1", "Riya vote pls ", 2 * H),
        C("cm_x1", "cv_x1", "x1", "Want 10k followers fast? DM for prices ", 3 * H),
    ])
    db.add_all([M.Status(id="st_u1", user_id="u1", kind="text", text="Found the crispiest dosa in town", bg="#FF8A3D", audience="friends", at=t - 2 * H),
                M.Status(id="st_u4", user_id="u4", kind="mood", moji=203, text="Sketching all day", audience="close", at=t - 5 * H),
                M.Status(id="st_u6", user_id="u6", kind="text", text="Munnar mist this morning", bg="#3DBE8B", audience="public", at=t - 9 * H),
                M.Status(id="st_riya", user_id="usr_riya", kind="text", text="Ep 5 script locked ", bg="#6C3BFF", audience="friends", at=t - 1 * H),
                M.Status(id="st_old", user_id="u1", kind="text", text="(yesterday)", audience="public", at=t - 30 * H)])
    db.add_all([M.Town(id="town_cbe", name="Coimbatore Creators", open=True, hue=280, about="Creators from Kovai — collabs, meetups, feedback", owner_id="usr_riya", at=t - 60 * D),
                M.Town(id="town_chai", name="Chai Comedy Club", open=False, hue=30, about="Invite-only writers' room for chai-break comedy", owner_id="u4", invite_code="CHAI2026", at=t - 40 * D),
                M.Town(id="town_indie", name="Indie Devs", open=True, hue=200, about="Ship small games and apps, together", owner_id="u2", at=t - 20 * D)])
    db.flush()
    db.add_all([M.TownMember(town_id="town_cbe", user_id="usr_riya", role="owner"), M.TownMember(town_id="town_cbe", user_id="u1", role="admin"),
                M.TownMember(town_id="town_cbe", user_id="u3", role="member"), M.TownMember(town_id="town_cbe", user_id="u6", role="moderator"),
                M.TownMember(town_id="town_chai", user_id="u4", role="owner"), M.TownMember(town_id="town_chai", user_id="usr_riya", role="member"),
                M.TownMember(town_id="town_indie", user_id="u2", role="owner"), M.TownMember(town_id="town_indie", user_id="u5", role="member"),
                M.TownChannel(id="ch_cbe_general", town_id="town_cbe", name="general"), M.TownChannel(id="ch_cbe_collabs", town_id="town_cbe", name="collabs"),
                M.TownChannel(id="ch_chai_general", town_id="town_chai", name="general"), M.TownChannel(id="ch_indie_general", town_id="town_indie", name="general"),
                M.TownBoard(town_id="town_cbe", text="Meetup this Sunday 5pm at Race Course — bring your best 30s idea!", at=t - 2 * D)])
    db.flush()
    db.add_all([M.TownMessage(channel_id="ch_cbe_general", sender="u1", text="Welcome new folks ", at=t - 2 * D), M.TownMessage(channel_id="ch_cbe_general", sender="usr_riya", text="Sunday meetup confirmed!", at=t - D),
                M.TownMessage(channel_id="ch_cbe_collabs", sender="u6", text="Looking for a travel + food collab in Ooty", at=t - 6 * H),
                M.TownMessage(channel_id="ch_chai_general", sender="u4", text="Tonight's prompt: the office kettle is sentient", at=t - 8 * H)])
    db.add_all([M.Notice(user_id="usr_riya", module="chat", kind="friend", title="Rohan Das sent you a friend request", body="@rohan.plays", route="Friends", params={"requestId": "fr_u5"}, at=t - 4 * H),
                M.Notice(user_id="usr_riya", module="chat", kind="ping", title="Aanya Rao sent you a Heart Ping", body="@aanya.eats", route="Friends", params={"from": "u1", "moji": 7, "kind": "heart"}, at=t - 90 * MIN)])
    for k, v in LAYERS.items(): db.add(M.KV(ns="config", key=k, value=v))
    db.add_all([M.KV(ns="config_meta", key="version", value={"v": 1}), M.KV(ns="appcfg", key="zones", value=DEFAULT_ZONES),
                M.KV(ns="appcfg", key="slabs", value={"items": DEFAULT_SLABS}), M.KV(ns="appcfg", key="languages", value=DEFAULT_LANGS)])

def seed_v3(db, t):
    """v3 money: labelled demo plans/products/ads. Every money switch is OFF; integrations are empty (mode test) — no keys anywhere."""
    from .routes_money import DEFAULT_SETTINGS, DEFAULT_COUNTRIES
    from .routes_ads import DEFAULT_SLABS as AD_SLABS
    from .routes_integrations import DEFAULTS as INTEG
    db.add_all([M.KV(ns="money", key="settings", value=DEFAULT_SETTINGS), M.KV(ns="money", key="countries", value=DEFAULT_COUNTRIES),
                M.KV(ns="ads", key="slabs", value=AD_SLABS)] + [M.KV(ns="integrations", key=k, value=dict(v)) for k, v in INTEG.items()])
    db.add_all([M.Plan(id="plan_backstage", name="Backstage Pass", period="month", prices={"IN": 9900, "US": 199}, demo=True, sort=1,
                       perks=["Demo plan — set real perks in admin", "Members-only Drops", "Early Flicks"]),
                M.Plan(id="plan_creator_pro", name="Creator Pro", period="month", prices={"IN": 29900, "US": 499}, demo=True, sort=2,
                       perks=["Demo plan — set real perks in admin", "Lower platform fee", "Stash analytics"])])
    db.add_all([M.Product(id="prd_presets", creator_id="u1", title="Street-food preset pack (demo)", desc="Demo listing · 12 warm photo presets", price=14900, demo=True, at=t - 3 * D),
                M.Product(id="prd_zine", creator_id="u4", title="Color Day sticker zine (demo)", desc="Demo listing · printable sticker zine", price=49900, demo=True, at=t - 2 * D),
                M.Product(id="prd_guide", creator_id="u4", title="Free sketching guide (demo)", desc="Demo listing · free PDF guide", price=0, demo=True, at=t - D)])
    db.add_all([M.Ad(id="ad_demo_chai", title="Chai Co. — demo ad", body="Demo Boost · shown labelled Sponsored", cta="Learn more", url="https://example.com/demo-chai", sponsor="Demo Sponsor", places=["feed", "explore"], demo=True),
                M.Ad(id="ad_demo_bus", title="City Bus Pass — demo ad", body="Demo Boost · shown labelled Sponsored", cta="See more", url="https://example.com/demo-bus", sponsor="Demo Sponsor", places=["feed", "chat_list"], demo=True)])

if __name__ == "__main__": run(reset="--reset" in sys.argv)
