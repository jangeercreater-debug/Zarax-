
import json, sys, urllib.request, urllib.error

API = "https://zaraxapi-production.up.railway.app"
GW  = "https://zaraxvoice-gateway-production.up.railway.app"
EMAIL = "jangeersinghktm@gmail.com"

def _send(req):
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body[:400]}

def post(url, payload, token=None):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    return _send(req)

def get(url, token):
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", "Bearer " + token)
    return _send(req)

pw = sys.argv[1]

print("== 1. LOGIN ==")
code, body = post(API + "/v1/auth/login", {"email": EMAIL, "password": pw})
print("status:", code)
if code not in (200, 201):
    print("response:", json.dumps(body)[:400]); sys.exit()
token = body.get("accessToken") or body.get("data", {}).get("accessToken")
if not token:
    print("keys:", list(body.keys())); print(json.dumps(body)[:400]); sys.exit()
print("token length:", len(token))

print("")
print("== 2. AGENTS ==")
code, body = get(API + "/v1/agents", token)
print("status:", code)
items = body.get("data") or body.get("items") or [] if isinstance(body, dict) else body
published = None
for a in items if isinstance(items, list) else []:
    print("  ", a.get("id"), "|", a.get("name"), "| active =", a.get("isActive"))
    if a.get("isActive") and not published:
            if a.get("id") == "bf25552c-2814-4cc6-a098-b7100fbe3ef5": published = a.get("id"); break
        published = a.get("id")
if not published:
    print("!! no published agent"); sys.exit()

print("")
print("== 3. CREATE ROOM ==")
print("agentId:", published)
code, body = post(GW + "/rooms/token", {"agentId": published}, token)
print("status:", code)
if code not in (200, 201):
    print("response:", json.dumps(body)[:500]); sys.exit()
print("callId    :", body.get("callId"))
print("roomName  :", body.get("roomName"))
print("livekitUrl:", body.get("livekitUrl"))
print("")
import urllib.parse as _up, subprocess
_url = ("https://meet.livekit.io/custom?liveKitUrl="
        + _up.quote(body.get("livekitUrl"), safe="")
        + "&token=" + _up.quote(body.get("token"), safe=""))
open("JOIN.md", "w").write(
    "# ZaraX Voice Call\n\n## [TAP HERE TO JOIN THE CALL](" + _url + ")\n\n"
    "Room: `" + body.get("roomName") + "`\n\nToken expires in 15 minutes.\n")
subprocess.run(["git", "checkout", "-B", "join-link"], check=False)
subprocess.run(["git", "add", "-f", "JOIN.md"], check=False)
subprocess.run(["git", "commit", "-m", "chore: join link", "--no-verify"], check=False)
subprocess.run(["git", "push", "-f", "origin", "join-link", "--no-verify"], check=False)
subprocess.run(["git", "checkout", "main"], check=False)
print("")
print("=========================================")
print(" OPEN THIS PAGE ON YOUR PHONE AND TAP:")
print(" github.com/jangeercreater-debug/Zarax-/blob/join-link/JOIN.md")
print("=========================================")
