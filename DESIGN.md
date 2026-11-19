# VibeRoom design rules

Dark, loud accent, quiet everything else. The memorable thing is **room identity**: each room has its own two-colour gradient (derived from its code with `roomColors()`), and the room screen glows with it. Keep all other surfaces calm so that stays the focus.

## Tokens (`mobile/src/lib/theme.ts`)
- Ink `#0B0B12` background, Panel `#14141F`, Raised `#1D1D2D`, Line `#2A2A3D`
- Primary electric purple `#8B5CF6`; secondary cyan `#22D3EE`, pink `#EC4899`
- Text `#F4F4F8`, muted `#9A9AB2`; danger `#F87171`, success `#34D399`, warning `#FBBF24`
- Radii: 10 / 16 / 24 / pill. Use the larger radius only for the largest surface on a screen.
- Type: system font. Display 34/900, title 26/800, heading 19/700, body 16, small 13. Tight negative tracking on big sizes.

## Rules
1. Sentence case everywhere. No all-caps labels, no tracked eyebrows above headings.
2. Buttons say what happens: "Add to queue", "Join room", not "Submit".
3. A track is only shown as playing when the audio engine really is playing. Never fake it.
4. Every list has three states: skeleton while loading, an empty state that tells the person what to do, an error with Retry.
5. Touch targets at least 44pt. Every icon button has an accessibility label.
6. Controls the server will refuse (non-moderators controlling playback) are hidden or explained, not offered.
7. Motion only answers a tap (press, vote, add). No decorative entrance animations.
8. One gradient per screen as the hero. Do not put gradients on every card.

## Review checklist
- Does the screen work with 0 items, 1 item and 50 items?
- Is anything tappable smaller than 44pt?
- Is text on a gradient readable (contrast)?
- Does failure say what went wrong and what to do?
