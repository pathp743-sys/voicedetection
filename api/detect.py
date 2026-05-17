from http.server import BaseHTTPRequestHandler
import json, io, os, tempfile, urllib.request, urllib.parse

HF_TOKEN = os.environ.get("HF_TOKEN", "")
MODEL_ID = "Speech-Arena-2025/DF_Arena_1B_V_1"
# HuggingFace Inference API endpoint for this model
HF_URL = f"https://api-inference.huggingface.co/models/{MODEL_ID}"

def query_model(audio_bytes: bytes, content_type: str):
    req = urllib.request.Request(
        HF_URL,
        data=audio_bytes,
        headers={
            "Authorization": f"Bearer {HF_TOKEN}",
            "Content-Type": content_type,
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": f"HF API {e.code}: {body}"}
    except Exception as e:
        return {"error": str(e)}

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        content_type = self.headers.get("Content-Type", "audio/wav")

        if not HF_TOKEN:
            self._json({"error": "HF_TOKEN not set"}, 400)
            return

        result = query_model(body, content_type)

        if "error" in result:
            self._json(result, 502)
            return

        # Parse result — model returns list of {label, score}
        # Labels: 'spoof' (fake) and 'bonafide' (real)
        scores = {}
        if isinstance(result, list):
            for item in result:
                scores[item.get("label", "").lower()] = item.get("score", 0)
        elif isinstance(result, dict) and "all_scores" in result:
            scores = {k.lower(): v for k, v in result["all_scores"].items()}

        spoof_score = scores.get("spoof", scores.get("fake", 0))
        bonafide_score = scores.get("bonafide", scores.get("real", 1 - spoof_score))

        is_fake = spoof_score > 0.5
        confidence = round(max(spoof_score, bonafide_score) * 100)

        self._json({
            "isFake": is_fake,
            "confidence": confidence,
            "fakeScore": round(spoof_score * 100),
            "realScore": round(bonafide_score * 100),
            "model": MODEL_ID,
            "rawResult": result,
        })

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args):
        pass
