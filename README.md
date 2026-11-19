# VibeRoom

Social music rooms: join a room from your own phone, build a shared queue together, listen together, and (planned) sing karaoke duets.

Stack: Expo React Native + TypeScript (mobile), Node + Express + Socket.IO (server), PostgreSQL.

## Status (honest)

**Working and tested (27 passing server tests):** email auth with sessions and password reset, rooms (public/private, codes, passwords, QR invite payload), member presence, shared queue with votes/reorder/permissions, authoritative playback state, demo music provider with original generated audio, personal library (favorites, playlists, recents).

**In progress:** Expo app. Done: design system, auth/socket/player providers, login, tab layout with mini-player, full-screen player. **Still missing:** the five tab screens (Home, Discover, Rooms, Library, Profile), room screen, create/join screens. The app will not launch until these exist.

**Not started:** karaoke and duet sessions, social features (friends, notifications, games), Spotify provider (needs credentials and policy review).

## Run the server

1. Install PostgreSQL 16 and create a database: user `viberoom` / password `viberoom` / db `viberoom`.
2. `cp server/.env.example server/.env`
3. `npm install` (root), then `npm run db:migrate`, then `npm run server`.
4. Tests: `npm test` (creates a `viberoom_test` database).

## Run the mobile app

`cd mobile && npm install && npx expo start`, then scan the QR code with Expo Go. On a phone, set the server address on the login screen to your computer's Wi-Fi IP, e.g. `http://192.168.1.20:4000`.

## Notes

- The Prisma schema in `server/prisma/schema.prisma` documents the model; the running server uses `pg` with `server/migrations/*.sql`.
- Only the demo provider can play audio. Catalog-only providers must never be shown as playable.
