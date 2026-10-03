#!/usr/bin/env python3
"""Idempotent Appwrite setup for IgniteAI Expo: registration, admin + judge portal, seasons.

  APPWRITE_ENDPOINT=https://sfo.cloud.appwrite.io/v1 \
  APPWRITE_PROJECT=<project id> \
  APPWRITE_KEY=<server API key> \
  ADMIN_EMAIL=<first admin's email> ADMIN_NAME="<name>" \
  python3 scripts/appwrite_setup.py

Creates the teams (admins, judges), every table with its permissions, the first
season, and the first admin account. Tables are shared by all seasons: each row
carries a `season` id, and the portal filters by it. Safe to re-run: existing things are left alone.
The API key is only used here. Never put it in the website code.
"""
import json, os, sys, time, urllib.request, urllib.error

E = os.environ["APPWRITE_ENDPOINT"].rstrip("/")
P = os.environ["APPWRITE_PROJECT"]
K = os.environ["APPWRITE_KEY"]
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Expo Admin")
DB = "expo"


def api(method, path, body=None, ok=(200, 201, 202, 204)):
    req = urllib.request.Request(E + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json",
                                          "X-Appwrite-Project": P, "X-Appwrite-Key": K})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"message": raw.decode()[:200]}


def step(label, status, res):
    if status in (200, 201, 202, 204):
        print(f"  ok      {label}")
    elif status == 409:
        print(f"  exists  {label}")
    else:
        print(f"  FAILED  {label}: {status} {res.get('message')}")
        global failed
        failed = True


failed = False
ADMINS, JUDGES = 'team:admins', 'team:judges'


def perms(**kw):
    out = []
    for action, roles in kw.items():
        for r in roles:
            out.append(f'{action}("{r}")')
    return out


ADMIN_ALL = dict(read=[ADMINS], create=[ADMINS], update=[ADMINS], delete=[ADMINS])


def table(tid, name, permissions, row_security=False):
    s, r = api("POST", f"/tablesdb/{DB}/tables",
               {"tableId": tid, "name": name, "permissions": permissions, "rowSecurity": row_security})
    if s == 409:  # make sure permissions are current
        s2, r2 = api("PUT", f"/tablesdb/{DB}/tables/{tid}",
                     {"name": name, "permissions": permissions, "rowSecurity": row_security, "enabled": True})
        step(f"table {tid} (permissions refreshed)", s2, r2)
    else:
        step(f"table {tid}", s, r)


def col(tid, kind, key, **kw):
    body = {"key": key, "required": kw.pop("required", False)}
    body.update(kw)
    s, r = api("POST", f"/tablesdb/{DB}/tables/{tid}/columns/{kind}", body)
    # On a re-run, a table that is near its size limit answers 400 "maximum size reached"
    # for a column that already exists, instead of 409. Treat that as "exists".
    if s == 400 and api("GET", f"/tablesdb/{DB}/tables/{tid}/columns/{key}")[0] == 200:
        s = 409
    step(f"  {tid}.{key}", s, r)


def string(tid, key, size, required=False, array=False, default=None):
    kw = dict(size=size, required=required)
    if array:
        kw["array"] = True
    if default is not None:
        kw["default"] = default
    col(tid, "string", key, **kw)


def index(tid, key, columns, kind="key"):
    s, r = api("POST", f"/tablesdb/{DB}/tables/{tid}/indexes", {"key": key, "type": kind, "columns": columns})
    step(f"  index {tid}.{key}", s, r)


print("== teams")
for tid, name in (("admins", "Admins"), ("judges", "Judges")):
    step(f"team {tid}", *api("POST", "/teams", {"teamId": tid, "name": name}))

if api("GET", f"/tablesdb/{DB}")[0] == 200:
    print("  exists  database expo")
else:
    step("database expo", *api("POST", "/tablesdb", {"databaseId": DB, "name": "IgniteAI Expo"}))

print("== seasons (public: the site reads the current season's dates from here)")
T = "seasons"
table(T, "Seasons", perms(read=["any"], create=[ADMINS], update=[ADMINS], delete=[ADMINS]))
string(T, "name", 120, required=True)          # "IgniteAI Expo 2026"
col(T, "integer", "year", required=True)
col(T, "datetime", "applyDeadline")
col(T, "boolean", "registrationOpen", default=True)
col(T, "boolean", "isCurrent", default=False)

print("== settings (one row per season, id = season id; admins only)")
T = "settings"
table(T, "Settings", perms(**ADMIN_ALL))
for k, size in (("signerName", 120), ("signerTitle", 160), ("issuedOn", 40), ("interviewDate", 160),
                ("zoomK3", 500), ("zoom46", 500), ("zoom78", 500), ("zoom912", 500),
                ("fromName", 120), ("replyTo", 160), ("siteUrl", 200)):
    string(T, k, size)
col(T, "boolean", "autoConfirmEmail", default=True)
col(T, "integer", "nextEntryNumber", default=1000)   # taken atomically by the expo-api function
col(T, "boolean", "judgeSignupOpen", default=True)
string(T, "judgeSignupCode", 40)     # people who sign up with this code are approved instantly
string(T, "judgeDiscordUrl", 300)    # shown to judges only after they are approved
string(T, "judgeCommitment", 400)    # e.g. "1–2 hours, interviewing 6–8 projects on Zoom"
string(T, "judgeZoomUrl", 500)       # judges' briefing room, shown in the judge portal
string(T, "judgeNotes", 2000)        # organizers' note to judges, shown in the judge portal
string(T, "lateRegistrationCode", 40) # private link register.html?late=<code> accepts entries after the deadline

print("== registrations (written only by the expo-api function, so numbering + deadline are enforced)")
T = "registrations"
table(T, "Registrations", perms(read=[ADMINS], create=[ADMINS], update=[ADMINS], delete=[ADMINS]))
string(T, "season", 36, required=True)
col(T, "integer", "entryNumber")
string(T, "firstName", 80, required=True); string(T, "lastName", 80, required=True)
col(T, "enum", "grade", required=True, elements=["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"])
col(T, "enum", "division", required=True, elements=["K-3", "4-6", "7-8", "9-12"])
string(T, "school", 160, required=True); string(T, "city", 120, required=True); string(T, "country", 80, required=True)
col(T, "email", "studentEmail")
string(T, "parentName", 160, required=True)
col(T, "email", "parentEmail", required=True)
string(T, "parentPhone", 40)
string(T, "projectTitle", 200, required=True)
string(T, "track", 60, required=True)
string(T, "xField", 120)
col(T, "enum", "entryType", required=True, elements=["individual", "team"])
string(T, "teamName", 120)
# A team is ONE registration: the first student is in firstName/lastName/grade, the rest are listed here.
string(T, "memberNames", 160, array=True)
string(T, "memberGrades", 3, array=True)
string(T, "projectSummary", 5000)
col(T, "url", "demoUrl"); col(T, "url", "codeUrl")
string(T, "aiTools", 500)
col(T, "boolean", "agreedToRules"); col(T, "boolean", "parentApproved")
col(T, "enum", "status", elements=["new", "accepted", "rejected", "withdrawn"], default="new")
string(T, "adminNotes", 2000)
string(T, "projectId", 36)

print("== judges (sign-up profiles, one per person per season; written by the expo-api function)")
T = "judges"
table(T, "Judges", perms(**ADMIN_ALL))
string(T, "season", 36, required=True)
string(T, "userId", 36, required=True)
string(T, "name", 120, required=True)
col(T, "email", "email", required=True)
string(T, "phone", 40)
string(T, "affiliation", 160)        # school, company or organization
string(T, "role", 60)                # student, faculty, industry, ...
string(T, "background", 1500)
string(T, "tracks", 60, array=True)
string(T, "divisions", 10, array=True)
string(T, "conflicts", 600)          # students they know / should not judge
col(T, "boolean", "agreed")
col(T, "enum", "status", elements=["pending", "approved", "declined"], default="pending")

print("== projects (what judges see: no contact details)")
T = "projects"
table(T, "Projects", perms(read=[ADMINS, JUDGES], create=[ADMINS], update=[ADMINS], delete=[ADMINS]))
string(T, "season", 36, required=True)
col(T, "integer", "entryNumber")
string(T, "title", 200, required=True)
string(T, "track", 60, required=True)
string(T, "division", 10, required=True)
string(T, "entryType", 12)
string(T, "teamName", 120)
string(T, "members", 800)
col(T, "integer", "memberCount")
string(T, "country", 200)
string(T, "xField", 120)
string(T, "summary", 5000)
string(T, "demoUrl", 500)
string(T, "codeUrl", 500)
string(T, "aiTools", 500)
col(T, "enum", "status", elements=["submitted", "accepted", "finalist", "rejected", "withdrawn"], default="submitted")
string(T, "assignedJudges", 36, array=True)
string(T, "interviewTime", 120)
string(T, "award", 160)
col(T, "integer", "place")

print("== reviews (each judge only sees their own rows)")
T = "reviews"
table(T, "Reviews", perms(create=[JUDGES, ADMINS], read=[ADMINS], update=[ADMINS], delete=[ADMINS]), row_security=True)
string(T, "season", 36, required=True)
string(T, "projectId", 36, required=True)
string(T, "judgeId", 36, required=True)
string(T, "judgeName", 120)
# The rubric (see CRITERIA in portal/common.js): three scores 1-10, total out of 30.
for k in ("scoreTechnical", "scoreIdea", "scorePresentation"):
    col(T, "integer", k, min=1, max=10)
# 2026 launch rubric, kept so older rows still load
for k in ("scoreDemo", "scoreUnderstanding", "scoreUsefulness", "scoreCreativity"):
    col(T, "integer", k, min=0, max=10)
col(T, "integer", "total", min=0, max=40)
string(T, "comments", 4000)       # public: shared with the students
string(T, "privateNotes", 2000)   # private: judges + organizers only
col(T, "enum", "recommendation", elements=["award", "strong", "solid", "developing"])
col(T, "boolean", "submitted", default=False)

print("== results (public: powers the results page)")
T = "results"
table(T, "Results", perms(read=["any"], create=[ADMINS], update=[ADMINS], delete=[ADMINS]))
string(T, "season", 36, required=True)
string(T, "projectId", 36)
string(T, "title", 200, required=True)
string(T, "division", 10, required=True)
string(T, "track", 60, required=True)
string(T, "award", 160, required=True)
col(T, "integer", "place")
string(T, "students", 800)
string(T, "country", 200)
col(T, "integer", "sort")

print("== certificates")
T = "certificates"
table(T, "Certificates", perms(**ADMIN_ALL))
string(T, "season", 36, required=True)
string(T, "eventName", 120)
string(T, "registrationId", 36)
string(T, "projectId", 36)
string(T, "recipientName", 200, required=True)
col(T, "enum", "kind", elements=["participation", "finalist", "award"], required=True)
string(T, "awardText", 200)
string(T, "projectTitle", 200)
string(T, "division", 10)
string(T, "track", 60)
string(T, "issuedOn", 40)
string(T, "signerName", 120)
string(T, "signerTitle", 160)
string(T, "email", 160)

print("== notifications (send log)")
T = "notifications"
table(T, "Notifications", perms(**ADMIN_ALL))
string(T, "season", 36, required=True)
string(T, "subject", 300, required=True)
string(T, "body", 10000)
string(T, "audience", 300)
col(T, "integer", "recipientCount")
col(T, "integer", "sentCount")
col(T, "integer", "failedCount")
string(T, "status", 20)
string(T, "sentBy", 120)
string(T, "errors", 4000)

print("== indexes (waiting for columns to finish processing)")
time.sleep(10)
index("seasons", "by_current", ["isCurrent"])
index("registrations", "by_season", ["season", "status"])
index("registrations", "entry_number", ["season", "entryNumber"], kind="unique")
index("registrations", "by_project", ["projectId"])
index("registrations", "by_contact", ["season", "parentEmail"])
index("projects", "by_season", ["season", "division", "track"])
index("reviews", "by_season", ["season"])
index("reviews", "by_judge", ["judgeId", "season"])
index("reviews", "one_review_per_judge", ["projectId", "judgeId"], kind="unique")
index("results", "by_season", ["season", "division", "sort"])
index("certificates", "by_season", ["season"])
index("notifications", "by_season", ["season"])
index("judges", "by_season", ["season", "status"])
index("judges", "one_signup_per_season", ["season", "userId"], kind="unique")

print("== first season")
SEASON = os.environ.get("SEASON_ID", "2026")
s, r = api("POST", f"/tablesdb/{DB}/tables/seasons/rows", {"rowId": SEASON, "data": {
    "name": f"IgniteAI Expo {SEASON}", "year": int(SEASON), "applyDeadline": "2026-09-28T06:59:00.000+00:00",
    "registrationOpen": True, "isCurrent": True}})
step(f"season {SEASON}", s, r)
s, r = api("POST", f"/tablesdb/{DB}/tables/settings/rows", {"rowId": SEASON, "data": {
    "signerName": "", "signerTitle": "Director, IgniteAI Expo", "issuedOn": "October 9, 2026",
    "interviewDate": "Sunday, October 4, 2026, 9:30 – 11:30 AM PT",
    "fromName": "IgniteAI Expo", "replyTo": "hello@mail.igniteaiexpo.org", "siteUrl": "https://igniteaiexpo.org",
    "autoConfirmEmail": True, "nextEntryNumber": 1000}})
step(f"settings {SEASON}", s, r)

if ADMIN_EMAIL:
    print("== first admin")
    s, r = api("GET", "/users?queries[]=" + urllib.request.quote(json.dumps(
        {"method": "equal", "attribute": "email", "values": [ADMIN_EMAIL]})))
    if s == 200 and r.get("total"):
        uid = r["users"][0]["$id"]
        print(f"  exists  user {ADMIN_EMAIL} ({uid})")
    else:
        s, r = api("POST", "/users", {"userId": "unique()", "email": ADMIN_EMAIL, "name": ADMIN_NAME})
        step(f"user {ADMIN_EMAIL}", s, r)
        uid = r.get("$id")
    if uid:
        # Owner of both teams, so this admin can invite other admins and judges from the portal.
        for team in ("admins", "judges"):
            s, r = api("POST", f"/teams/{team}/memberships", {"userId": uid, "roles": ["owner"]})
            step(f"{ADMIN_EMAIL} -> {team} (owner)", s, r)

print("\nFAILED — see above." if failed else "\nDone.")
sys.exit(1 if failed else 0)
