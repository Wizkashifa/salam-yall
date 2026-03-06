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
3. **Events (events.tsx)**: Google Calendar integration displaying community events with organizer names
4. **Directory (businesses.tsx)**: Muslim business directory with category filtering

## Key Files

- `lib/prayer-utils.ts` - Prayer time calculations, Hijri date, masjid data
- `lib/theme-context.tsx` - Dark/light mode context provider
- `lib/query-client.ts` - React Query setup with API fetcher
- `server/google-calendar.ts` - Google Calendar OAuth integration via Replit connector
- `server/routes.ts` - API routes for events and businesses, address-to-organization mapping
- `constants/colors.ts` - Light and dark color palettes

## APIs

- `GET /api/events` - Fetches upcoming events from Google Calendar with organizer resolution
- `GET /api/businesses` - Returns list of Muslim businesses (hardcoded data)

## Integrations

- **Google Calendar**: Connected via Replit integration connector for community events calendar
- **Adhan.js**: Client-side prayer time calculation (North America method)
- **expo-location**: For prayer times accuracy and nearest masjid distance

## Dependencies

Key packages: adhan, react-native-webview, expo-location, expo-linear-gradient, googleapis
