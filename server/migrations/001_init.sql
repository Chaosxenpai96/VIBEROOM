-- VibeRoom initial schema. Mirrors prisma/schema.prisma (kept as a reference model).
CREATE TYPE room_visibility AS ENUM ('PUBLIC', 'PRIVATE', 'LOCAL');
CREATE TYPE room_role AS ENUM ('HOST', 'MODERATOR', 'MEMBER');
CREATE TYPE queue_policy AS ENUM ('ANYONE_CAN_ADD', 'MODERATORS_ONLY');
CREATE TYPE queue_status AS ENUM ('QUEUED', 'PLAYING', 'PLAYED', 'REMOVED');
CREATE TYPE play_state AS ENUM ('PLAYING', 'PAUSED', 'STOPPED');
CREATE TYPE friend_status AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');
CREATE TYPE karaoke_status AS ENUM ('LOBBY', 'ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE duet_role AS ENUM ('SINGER_A', 'SINGER_B');
CREATE TYPE duet_invite_status AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED');

CREATE TABLE users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  avatar_color text NOT NULL DEFAULT '#8B5CF6',
  bio text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);

CREATE TABLE password_resets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE friends (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requester_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status friend_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE music_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  can_stream boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE music_tracks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider_id text NOT NULL REFERENCES music_providers(id),
  provider_track_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  album text,
  duration_ms integer NOT NULL,
  artwork_url text,
  genre text,
  audio_path text,
  is_karaoke boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_track_id)
);
CREATE INDEX music_tracks_title_idx ON music_tracks(lower(title));
CREATE INDEX music_tracks_artist_idx ON music_tracks(lower(artist));

CREATE TABLE playlists (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX playlists_user_idx ON playlists(user_id);

CREATE TABLE playlist_tracks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  playlist_id text NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES music_tracks(id),
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, track_id)
);

CREATE TABLE rooms (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  visibility room_visibility NOT NULL DEFAULT 'PUBLIC',
  password_hash text,
  require_approval boolean NOT NULL DEFAULT false,
  max_members integer NOT NULL DEFAULT 20 CHECK (max_members BETWEEN 2 AND 200),
  queue_policy queue_policy NOT NULL DEFAULT 'ANYONE_CAN_ADD',
  vote_ordering boolean NOT NULL DEFAULT false,
  host_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX rooms_visibility_idx ON rooms(visibility, closed_at);

CREATE TABLE room_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role room_role NOT NULL DEFAULT 'MEMBER',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX room_members_user_idx ON room_members(user_id);

CREATE TABLE queue_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES music_tracks(id),
  added_by_id text NOT NULL REFERENCES users(id),
  position integer NOT NULL,
  status queue_status NOT NULL DEFAULT 'QUEUED',
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_items_room_idx ON queue_items(room_id, status, position);

CREATE TABLE queue_votes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  queue_item_id text NOT NULL REFERENCES queue_items(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_item_id, user_id)
);

-- One authoritative playback clock per room. position_ms is the position at
-- updated_at; clients extrapolate while state = PLAYING.
CREATE TABLE playback_sessions (
  room_id text PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  queue_item_id text REFERENCES queue_items(id) ON DELETE SET NULL,
  state play_state NOT NULL DEFAULT 'STOPPED',
  position_ms integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  player_user_id text REFERENCES users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 0
);

CREATE TABLE karaoke_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES music_tracks(id),
  status karaoke_status NOT NULL DEFAULT 'LOBBY',
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX karaoke_sessions_room_idx ON karaoke_sessions(room_id);

CREATE TABLE duet_participants (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id text NOT NULL REFERENCES karaoke_sessions(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role duet_role NOT NULL,
  status duet_invite_status NOT NULL DEFAULT 'INVITED',
  UNIQUE (session_id, user_id)
);

CREATE TABLE user_favorites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES music_tracks(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, track_id)
);

CREATE TABLE listening_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES music_tracks(id),
  room_id text,
  played_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listening_history_user_idx ON listening_history(user_id, played_at DESC);

CREATE TABLE notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
