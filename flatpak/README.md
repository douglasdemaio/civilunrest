# Civil Unrest — Digital Edition (flatpak)

Desktop packaging for the [Civil Unrest](https://github.com/douglasdemaio/civilunrest)
digital board game. The same static `game/` folder is bundled here and wrapped
in a WebKitGTK window by `app.py`; the browser edition and this flatpak run
byte-identical game code.

The physical board game is available to order at
https://www.thegamecrafter.com/games/civil-unrest1 (America expansion:
https://www.thegamecrafter.com/games/civil-unrest:-america).

## Run the wrapper natively (development)

Requires Python 3 + PyGObject and webkit2gtk 4.1:

```bash
python3 flatpak/app.py
```

## Build and install the flatpak

```bash
cd flatpak
./build.sh --install
flatpak run com.demaio.CivilUnrest
```

First time only, install the runtime and SDK:

```bash
flatpak remote-add --if-not-exists --user flathub \
  https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.gnome.Platform//50 org.gnome.Sdk//50 \
  org.flatpak.Builder
```

`build.sh` uses the sandboxed `org.flatpak.Builder` when available and falls
back to a system `flatpak-builder`.

## Layout

| File | Purpose |
|---|---|
| `app.py` | GTK window + WebKit2 4.1 wrapper; serves `game/` over loopback HTTP and opens purchase links in the default browser |
| `com.demaio.CivilUnrest.yaml` | Flatpak manifest (GNOME runtime, bundles `../game`) |
| `com.demaio.CivilUnrest.desktop` | Desktop entry |
| `com.demaio.CivilUnrest.metainfo.xml` | AppStream metadata |
| `com.demaio.CivilUnrest.png` | App icon (derived from the game logo) |
| `build.sh` | Build / install / run helper |
