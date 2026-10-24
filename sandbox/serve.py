"""Local server for Savanna Animals Sandbox, port 8295, reachable from the phone on wifi.

Also passes messages between the phone remote (remote.html) and the animal screen (elephant.html):
POST /remote with a JSON body adds it to the message list, and GET /remote/poll?after=<n> waits
(up to 20 s) for messages newer than number n. Asking instead of streaming works through
Cloudflare tunnels too, which hold back streamed answers.

Run:  python serve.py
"""
import http.server
import json
import os
import socketserver
import threading
import urllib.parse

PORT = 8295
os.chdir(os.path.dirname(os.path.abspath(__file__)))

messages = []          # (number, json bytes), only the newest 300 kept
last_number = 0
new_message = threading.Condition()


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_POST(self):
        global last_number
        if self.path != "/remote":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            json.loads(body)
        except ValueError:
            self.send_error(400)
            return
        with new_message:
            last_number += 1
            messages.append((last_number, body))
            del messages[:-300]
            new_message.notify_all()
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/remote/poll":
            super().do_GET()
            return
        after = int(urllib.parse.parse_qs(url.query).get("after", ["-1"])[0])
        with new_message:
            if after >= 0:   # -1 = just starting: only learn the current number
                new_message.wait_for(lambda: last_number > after, timeout=20)
            news = [m for n, m in messages if n > after] if after >= 0 else []
            reply = b'{"last":%d,"msgs":[%s]}' % (last_number, b",".join(news))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 64


with Server(("0.0.0.0", PORT), NoCache) as httpd:
    print(f"Savanna Animals Sandbox on http://localhost:{PORT}")
    httpd.serve_forever()
