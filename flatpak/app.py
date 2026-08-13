#!/usr/bin/env python3
"""Civil Unrest — Digital Edition desktop wrapper.

Serves the bundled ``game/`` folder over a loopback HTTP server and displays it
in a native WebKitGTK window. The browser and flatpak editions run byte-identical
game code; this wrapper only adds the native window, window icon/title, and
external-link handling so purchase links (The Game Crafter) open in the user's
default browser instead of navigating the app window.

Run natively for development (webkit2gtk 4.1 required):

    python3 flatpak/app.py
"""

import os
import subprocess
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

APP_ID = "com.demaio.CivilUnrest"
APP_TITLE = "Civil Unrest — Digital Edition"

# Preferred locations of the bundled game folder.  Inside the flatpak the game
# is installed under /app/share/civilunrest; in a dev checkout it lives at
# <repo>/game next to the flatpak/ directory that contains this script.
_CANDIDATES = (
    os.path.join(os.environ.get("FLATPAK_DEST", "/app"), "share", "civilunrest", "game"),
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "game")),
)


def find_game_dir():
    for path in _CANDIDATES:
        if os.path.isfile(os.path.join(path, "index.html")):
            return path
    print("ERROR: game/index.html not found", file=sys.stderr)
    sys.exit(1)


class QuietHandler(SimpleHTTPRequestHandler):
    """Static file handler with no log spam."""

    def log_message(self, fmt, *args):
        pass


class GameServer:
    """Loopback HTTP server exposing the bundled game folder."""

    def __init__(self, directory):
        handler = lambda *args, **kwargs: QuietHandler(
            *args, directory=directory, **kwargs
        )
        self.httpd = HTTPServer(("127.0.0.1", 0), handler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def start(self):
        self.thread.start()

    def url(self, path="/index.html"):
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def open_external(uri):
    """Open a URI in the user's default browser."""
    try:
        if os.environ.get("FLATPAK_ID"):
            cmd = ["flatpak-spawn", "--host", "xdg-open", uri]
        else:
            cmd = ["xdg-open", uri]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass


def find_icon():
    for path in (
        os.path.join(os.environ.get("FLATPAK_DEST", "/app"), "share", "icons",
                     "hicolor", "512x512", "apps", APP_ID + ".png"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), APP_ID + ".png"),
    ):
        if os.path.isfile(path):
            return path
    return None


def is_external(uri):
    return uri.startswith(("http://", "https://")) and not uri.startswith("http://127.0.0.1")


def build_app(server):
    import gi

    gi.require_version("Gtk", "3.0")
    gi.require_version("WebKit2", "4.1")
    from gi.repository import Gtk, WebKit2

    def on_decide_policy(webview, decision, user_data=None):
        if isinstance(decision, WebKit2.NavigationPolicyDecision):
            uri = decision.get_navigation_action().get_request().get_uri()
            if is_external(uri):
                open_external(uri)
                decision.ignore()
                return True
        return False

    def on_create(webview, navigation_action, user_data=None):
        # target="_blank" links (e.g. The Game Crafter) → default browser.
        uri = navigation_action.get_request().get_uri()
        if is_external(uri):
            open_external(uri)
        return None

    def on_destroy(win):
        server.stop()
        Gtk.main_quit()

    settings = WebKit2.Settings()
    settings.set_enable_developer_extras(False)
    settings.set_javascript_can_open_windows_automatically(False)

    webview = WebKit2.WebView.new_with_settings(settings)
    webview.connect("decide-policy", on_decide_policy)
    webview.connect("create", on_create)

    win = Gtk.Window(title=APP_TITLE)
    win.set_default_size(1280, 820)
    win.set_position(Gtk.WindowPosition.CENTER)
    icon_path = find_icon()
    if icon_path:
        win.set_icon_from_file(icon_path)
    win.connect("destroy", on_destroy)
    win.add(webview)
    win.show_all()

    webview.load_uri(server.url())
    Gtk.main()


def main():
    game_dir = find_game_dir()
    server = GameServer(game_dir)
    server.start()
    print("Civil Unrest serving %s at %s" % (game_dir, server.url()), file=sys.stderr)
    try:
        build_app(server)
    except KeyboardInterrupt:
        server.stop()


if __name__ == "__main__":
    main()
