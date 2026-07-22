
import json, urllib.request, urllib.error, urllib.parse, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

API = "https://zaraxapi-production.up.railway.app"
GW  = "https://zaraxvoice-gateway-production.up.railway.app"
EMAIL = "jangeersinghktm@gmail.com"
PW = sys.argv[1]

def _send(req):
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {"raw": e.read().decode()[:300]}

def post(url, payload, token=None):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    return _send(req)

def get(url, token):
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", "Bearer " + token)
    return _send(req)

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        c, b = post(API + "/v1/auth/login", {"email": EMAIL, "password": PW})
        if c not in (200, 201): return self.fail("login failed: " + str(b))
        tok = b.get("accessToken")
        c, b = get(API + "/v1/agents", tok)
        items = b.get("data") or b.get("items") or []
        agent = next((a["id"] for a in items if a.get("isActive")), None)
        if not agent: return self.fail("no published agent")
        c, b = post(GW + "/rooms/token", {"agentId": agent}, tok)
        if c not in (200, 201): return self.fail("room failed: " + str(b))
        url = ("https://meet.livekit.io/custom?liveKitUrl="
               + urllib.parse.quote(b["livekitUrl"], safe="")
               + "&token=" + urllib.parse.quote(b["token"], safe=""))
        print("room:", b["roomName"], flush=True)
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()
    def fail(self, msg):
        print("ERROR:", msg, flush=True)
        self.send_response(500); self.send_header("Content-Type","text/plain"); self.end_headers()
        self.wfile.write(msg.encode())

print("READY - open the forwarded port 8000 in your browser", flush=True)
HTTPServer(("0.0.0.0", 8000), H).serve_forever()
