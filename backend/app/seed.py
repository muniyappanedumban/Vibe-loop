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
    U = lambda id, email, handle, name, role, hue=280, **k: M.User(id=id, email=email, handle=handle, name=name, role=role, hue=hue, password_hash=pw, **k)
    db.add_all([
        U("usr_admin", "admin@vibeloop.app", "@vibeloop.staff", "VibeLoop Staff", "owner", 250),
        U("usr_riya", "riya@vibeloop.app", "@riya.makes", "Riya Kapoor", "creator", 280, bio="Comedy shorts about office chai life · testing everything in Loops first",
          settings={"minPayout": 500, "currency": "INR"}, social={"privacy": {"privateAccount": False, "teenSpace": False, "hideLikes": False, "commentGuard": True, "guardWords": ["spam", "fake followers"], "msgRequests": True}, "reactionPack": [7, 42, 118, 203, 77, 311], "profileMood": 118}),
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
    for k in ["publishing", "payouts", "ai_generation", "signups"]: db.add(M.KV(ns="kill", key=k, value={"on": False}))
    db.add(M.Audit(actor="system", action="seed", detail="demo data loaded"))
    db.commit(); print("seeded. demo logins: riya@vibeloop.app / admin@vibeloop.app, password", DEMO_PASSWORD)

if __name__ == "__main__": run(reset="--reset" in sys.argv)
