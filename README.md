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

## Joker

Zusätzlich zu ihrem Standardinhalt können Bälle einen von vier Jokern enthalten (z.B. Pokémon +
Joker). Chance pro Ball, optionale Gesamt-/Pro-Art-Obergrenzen und Gewichtung stellt der Host vor
Spielstart im Setup-Bildschirm ein ("Joker"-Bereich). Wer einen Ball mit Joker öffnet, bekommt ihn
sofort (sichtbar wird er aber erst nach der Ball-Enthüllung, um die Spannung nicht vorwegzunehmen)
und kann ihn während seines eigenen Zugs einmalig einsetzen — direkt im Team-Header neben dem
eigenen Namen zeigt sich für beide Teilnehmer öffentlich, wer welchen Joker zur Verfügung hat.
Wondertrade, Wechsel und Protect sind freie Aktionen ohne Zugverbrauch und bleiben auch nach
Draft-Ende nutzbar, solange noch welche übrig sind.

- **Veto**: Verwirft den gerade gezogenen Ball, ohne ihn platzieren zu müssen (Button direkt in der
  Ball-Enthüllung oder über das Joker-Badge im eigenen Team-Header).
- **Wondertrade**: Würfelt ein bereits platziertes Pokémon (eigenes oder gegnerisches) neu aus,
  gemäß der beim Pool-Setup gewählten Pokémon-Filter. Joker-Badge anklicken, danach ein Pokémon in
  einem der beiden Teams auswählen.
- **Wechsel**: Tauscht zwei gleichartige Slots im eigenen Team (z.B. zwei Pokémon oder zwei
  Attacken). Joker-Badge anklicken, danach nacheinander zwei eigene Slots derselben Art auswählen.
- **Protect**: Ersetzt eine eigene, bereits platzierte Attacke durch Schutzschild. Joker-Badge
  anklicken, danach eine eigene Attacke auswählen.

Eigene Icons für die vier Joker lassen sich unter [`public/joker-icons/`](public/joker-icons/)
ablegen (`veto.png`, `wondertrade.png`, `wechsel.png`, `protect.png`) — ohne eigene Bilder zeigt
die App automatisch Emoji-Platzhalter.

## Wichtige Sicherheitseigenschaft

Die Zensur (Teilnehmer sehen vom Gegner-Team nur Kategorien wie "Item"/"Attacke", nie den Wert) wird **serverseitig
per Row-Level-Security** in Postgres erzwungen, nicht im Frontend. Ein geöffneter Browser-Devtools-Netzwerktab
zeigt Teilnehmern also nie mehr, als sie im UI ohnehin sehen dürfen.
