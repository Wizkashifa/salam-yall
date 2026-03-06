# Ummah Connect

Muslim community mobile app built with Expo (React Native) and Express backend.

## Architecture

- **Frontend**: Expo Router with file-based routing, 4 tab layout
- **Backend**: Express server on port 5000 serving APIs and landing page
- **State**: React Query for server state, useState for local state
- **Theme**: Dark/light mode via ThemeProvider context (`lib/theme-context.tsx`)
- **Colors**: Rich gold (#D4A843) and elegant green (#1B6B4A) palette in `constants/colors.ts`

## Tab Structure

1. **Prayer (index.tsx)**: Prayer times via `adhan` library, countdown timer, Hijri date, nearest masjid distance using `expo-location`
2. **Halal Eats (halal.tsx)**: WebView embedding of HalalEatsNC.com with timeout handling, retry, and caching
3. **Events (events.tsx)**: Google Calendar integration displaying community events with flyer images, organizer names, and registration links. Tapping opens a full-screen modal with image, details, and Register/RSVP button
4. **Directory (businesses.tsx)**: Muslim business directory with category filtering

## Key Files

- `lib/prayer-utils.ts` - Prayer time calculations, Hijri date, masjid data
- `lib/theme-context.tsx` - Dark/light mode context provider
- `lib/query-client.ts` - React Query setup with API fetcher
- `server/google-calendar.ts` - Google Calendar OAuth integration via Replit connector
- `server/routes.ts` - API routes, event processing (image extraction, registration URL extraction, organizer resolution), scheduled calendar refresh
- `constants/colors.ts` - Light and dark color palettes (uses `emerald` not `green` for the green color key)

## APIs

- `GET /api/events` - Fetches upcoming events with caching (15min TTL), returns organizer, imageUrl, registrationUrl fields
- `GET /api/businesses` - Returns list of Muslim businesses (hardcoded data)

## Event Processing Pipeline

- **Image extraction**: Parses `<img src="...">` from Google Calendar description HTML
- **Registration URL extraction**: Finds non-image links (forms.gle, docs.google.com/forms, eventbrite, tinyurl, etc.)
- **Organizer resolution** (3-tier):
  1. Hardcoded name matches (Islamic Center of Morrisville, IAR, etc.)
  2. Street name matches (Quail Fields → ICM, Deah Way → North Raleigh Masjid, etc.)
  3. Regex pattern detection for new venues (e.g., "Islamic Center of X", "Masjid X", "X Mosque")
  4. Venue name extraction from location field (text before first comma/address)
- **Scheduled refresh**: Events cached server-side, refreshed every hour, with 15-min TTL for API requests

## Integrations

- **Google Calendar**: Connected via Replit integration connector for community events calendar (read-only; another agent handles event creation)
- **Adhan.js**: Client-side prayer time calculation (North America method)
- **expo-location**: For prayer times accuracy and nearest masjid distance

## Dependencies

Key packages: adhan, react-native-webview, expo-location, expo-linear-gradient, googleapis
