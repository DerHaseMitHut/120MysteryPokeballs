# 120 Pokébälle

Multiplayer-Draft-Tool: 1 Host + 2 Teilnehmer ziehen abwechselnd aus 120 zufällig befüllten Pokébällen
(Pokémon/Item/Wesen/Fähigkeit/Attacke) und bauen daraus ihr 4er-Team. Mit Live-Facecams (WebRTC) und einer
separaten 1920×1080-Ansicht für OBS.

Architektur-Details stehen in [`supabase/schema.sql`](supabase/schema.sql) (Kommentare) und im ursprünglichen
Planungsdokument.

## 1. Supabase-Projekt einrichten

1. Neues Projekt auf [supabase.com](https://supabase.com) anlegen.
2. **Authentication → Providers → Anonymous Sign-Ins** aktivieren (wird für die Sitzplatz-/Host-Erkennung
   benötigt, ganz ohne Passwort/E-Mail).
3. **SQL Editor** öffnen, den gesamten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und
   ausführen. Das legt alle Tabellen, die RLS-Policies (Zensur-Logik) und alle Spiel-Funktionen an.
4. Unter **Project Settings → API** die `Project URL` und den `anon public` Key kopieren.

## 2. Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # dann URL + Anon-Key eintragen
npm run dev
```

Zum Testen der Zensur-/Mehrspieler-Logik am besten 3 unterschiedliche Browser-Profile verwenden (Host,
Teilnehmer 1, Teilnehmer 2) — gleiches Profil in mehreren Tabs teilt dieselbe anonyme Session/denselben Sitzplatz.

## 3. Deployment (GitHub → Netlify)

1. Dieses Repo auf GitHub pushen.
2. Auf [netlify.com](https://netlify.com) eine neue Site "Import from Git" mit diesem Repo anlegen
   (Build-Einstellungen aus `netlify.toml` werden automatisch übernommen: `npm run build`, Publish-Ordner `dist`).
3. Unter **Site settings → Environment variables** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen.
4. Deploy auslösen.

## Ablauf im Tool

1. Host öffnet `/` und trägt die 120 Inhalte (20 Pokémon, 15 Items, 15 Wesen, 15 Fähigkeiten, 55 Attacken) ein.
2. Host landet in der Lobby (`/host/:roomId`), teilt Raumcode/Einladungslink mit den beiden Freunden.
3. Teilnehmer öffnen den Link (`/join/:code`), wählen Platz 1 oder 2 und ihren Namen.
4. Host legt fest, wer beginnt, und startet das Spiel.
5. Abwechselnd Bälle öffnen und in einen passenden Team-Slot legen, bis beide locken oder alle Bälle offen sind.
6. Der Host findet unter "Links & Raumcode anzeigen" jederzeit einen OBS-Browser-Source-Link (1920×1080,
   schreibgeschützt) zum Streamen.

## Wichtige Sicherheitseigenschaft

Die Zensur (Teilnehmer sehen vom Gegner-Team nur Kategorien wie "Item"/"Attacke", nie den Wert) wird **serverseitig
per Row-Level-Security** in Postgres erzwungen, nicht im Frontend. Ein geöffneter Browser-Devtools-Netzwerktab
zeigt Teilnehmern also nie mehr, als sie im UI ohnehin sehen dürfen.
