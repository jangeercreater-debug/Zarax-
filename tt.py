
import sys, urllib.request, urllib.error
tok = sys.argv[1]
url = ("https://zaraxapi-production.up.railway.app"
       "/v1/internal/agents/78b75f8e-9bbd-468f-a055-e14038bfb61c/config")
req = urllib.request.Request(url)
req.add_header("x-internal-token", tok)
print("token length:", len(tok))
print("repr (first 20):", repr(tok[:20]))
print("repr (last 10) :", repr(tok[-10:]))
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print("STATUS:", r.status)
        print("OK -- token is correct")
        print(r.read().decode()[:900])
except urllib.error.HTTPError as e:
    print("STATUS:", e.code)
    print(e.read().decode()[:900])
