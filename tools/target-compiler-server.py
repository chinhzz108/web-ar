from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TargetCompilerHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/save-target":
            self.send_error(404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0:
                raise ValueError("empty request body")
            target_data = self.rfile.read(content_length)
            target_path = PROJECT_ROOT / "public" / "assets" / "targets.mind"
            target_path.write_bytes(target_data)
        except (ValueError, OSError) as error:
            self.send_error(400, str(error))
            return

        self.send_response(204)
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve and save the local MindAR target compiler output.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    handler = lambda *handler_args, **handler_kwargs: TargetCompilerHandler(
        *handler_args,
        directory=str(PROJECT_ROOT),
        **handler_kwargs,
    )
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {PROJECT_ROOT} on http://127.0.0.1:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
