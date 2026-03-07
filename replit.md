# Ummah Connect

Muslim community mobile app built with Expo (React Native) and Express backend.

## Architecture

- **Frontend**: Expo Router with file-based routing, 5 tab layout (Dines | Events | Home | Directory | Settings)
- **Backend**: Express server on port 5000 serving APIs and landing page
- **Database**: PostgreSQL via Replit's built-in database (businesses table)
- **State**: React Query for server state, useState for local state, AsyncStorage for preferences
- **Theme**: Dark/light/system mode via ThemeProvider context (`lib/theme-context.tsx`) — user can override via drawer settings
- **Settings**: Shared settings state via SettingsProvider context (`lib/settings-context.tsx`) — manages calcMethod, notifications, drawer open state
- **Colors**: Rich gold (#D4A843) and elegant green (#1B6B4A) palette in `constants/colors.ts`

## Tab Structure

1. **Prayer (index.tsx)**: Prayer times via `adhan` library, countdown timer, Hijri date, Qibla compass (uses expo-sensors Magnetometer on native), notification toggle for prayer alerts, mosque proximity silence reminder, hamburger menu button for drawer, "Where Should I Pray?" expandable dropdown (3 nearest masjids with estimated drive times + navigation), "Tonight Near You" expandable dropdown (tonight's events matched to nearby masjids from calendar API)
2. **Halal Eats (halal.tsx)**: Native restaurant directory with 317 halal restaurants from HalalEatsNC data, compact row cards (80×80 thumbnail + text), detail modal (pageSheet), search, halal/cuisine filters, open/closed status, Google Places photos via proxy, distance sorting with location
3. **Events (events.tsx)**: Google Calendar integration displaying community events with flyer images, organizer names, and registration links. Tapping opens a full-screen modal with image, details, and Register/RSVP button
4. **Directory (businesses.tsx)**: Muslim business directory with category filtering, Google Places integration (ratings, photos, hours), detail modal with Call/Directions/Website actions, business submission form with pending verification
5. **Settings (settings.tsx)**: Calculation method picker, adhan notification toggle, appearance switcher (System/Light/Dark), masjid directory, feedback form, privacy/support links

## Safe Area & TickerBanner

- **TickerBanner** (`components/TickerBanner.tsx`) renders at the top of every screen and includes safe area top padding (67px web, `insets.top` native)
- When no ticker messages exist, it renders a spacer `View` with the same height to keep headers properly positioned
- Individual screens do NOT add their own top safe area padding — TickerBanner handles it

## Slide-In Drawer Menu

- **Trigger**: Hamburger menu button in prayer tab header (top-left)
- **Component**: `components/AppDrawer.tsx` — animated slide-in from left using Modal + Animated API
- **Sections**:
  - **Settings**: Calculation method picker (12 methods from adhan library), Adhan notification toggle, Appearance switcher (System/Light/Dark)
  - **Masjid Directory**: Full list of nearby masjids; tapping a masjid opens a detail view with address (tappable for directions), website link, and matched upcoming events from the calendar
  - **Bug / Feature Request**: Feedback form with type toggle (bug/feature), text description, optional email, sends via mailto

## Key Files

- `lib/prayer-utils.ts` - Prayer time calculations, Hijri date, masjid data (with websites and matchTerms), Qibla bearing, mosque proximity check, calculation methods, event-masjid matching
- `lib/theme-context.tsx` - Dark/light/system mode context provider with AsyncStorage persistence
- `lib/settings-context.tsx` - Settings context: calcMethod, notifications toggle, drawer open/close state
- `lib/query-client.ts` - React Query setup with API fetcher
- `components/AppDrawer.tsx` - Animated slide-in drawer menu with settings, masjid directory, feedback form
- `server/google-calendar.ts` - Google Calendar OAuth integration via Replit connector
- `server/routes.ts` - API routes, event processing, calendar refresh, business CRUD with PostgreSQL
- `constants/colors.ts` - Light and dark color palettes (uses `emerald` not `green` for the green color key)

## APIs

- `GET /api/events` - Fetches upcoming events with caching (2min TTL), returns organizer, imageUrl, registrationUrl fields
- `POST /api/events/refresh` - Force-refresh events from Google Calendar
- `GET /api/ticker` - Fetches active ticker/announcement messages (auto-filters expired)
- `POST /api/ticker` - Create a ticker message (fields: message, type: info|urgent|event|reminder, expires_at)
- `DELETE /api/ticker/:id` - Deactivate a ticker message
- `POST /api/admin/login` - Admin login (returns session token)
- `POST /api/push-token` - Register Expo push token for notifications
- `POST /api/admin/push` - Send push notification to all registered devices (admin-only)
- `GET /api/admin/businesses?status=pending|approved|rejected` - List businesses by status (admin-only)
- `PATCH /api/admin/businesses/:id` - Approve or reject a business (admin-only)
- `DELETE /api/admin/businesses/:id` - Permanently delete a business (admin-only)
- `GET /api/halal-restaurants?status=IS_HALAL&cuisine=INDIAN_PAKISTANI&search=text` - Halal restaurant directory with optional filters
- `GET /api/halal-restaurants/:id/photo` - Proxies Google Places photo for a halal restaurant (keeps API key server-side)
- `GET /api/businesses` - Returns approved businesses with Google Places data from PostgreSQL database
- `GET /api/businesses/:id/places-details` - Fetches/caches Google Places details (rating, hours, location) for a business
- `GET /api/businesses/:id/photo` - Proxies Google Places photo for a business (keeps API key server-side)
- `POST /api/businesses/submit` - Submit a new business for review (requires name, category, address, email)
- `GET /privacy` - Privacy policy page (HTML)

## Database Schema

- **ticker_messages** table: id (serial PK), message, type (info/urgent/event/reminder), active (boolean), created_at, expires_at
- **push_tokens** table: id (serial PK), token (unique), created_at
- **halal_restaurants** table: id (serial PK), external_id, name, formatted_address, formatted_phone, url, place_id, lat, lng, is_halal (IS_HALAL/PARTIALLY_HALAL/NOT_HALAL/UNKNOWN), halal_comment, cuisine_types (text[]), emoji, evidence (text[]), considerations (text[]), opening_hours (jsonb), date_checked (jsonb), created_at, photo_reference (text), rating, user_ratings_total
- **businesses** table: id (serial PK), name, category, description, address, phone, website, submitted_by_email, status (pending/approved/rejected), created_at, place_id, rating, user_ratings_total, photo_reference, business_hours (jsonb), lat, lng

## Event Processing Pipeline

- **Image extraction**: Parses `<img src="...">` from Google Calendar description HTML
- **Registration URL extraction**: Finds non-image links (forms.gle, docs.google.com/forms, eventbrite, tinyurl, etc.)
- **Description cleaning**: Strips HTML, markdown, URLs, AI artifacts; picks richer section from divider-split text
- **Organizer resolution** (5-tier):
  1. "Hosted/presented/organized by" phrase extraction (filters generic phrases)
  2. Hardcoded name matches (Islamic Center of Morrisville, IAR, etc.)
  3. Street name matches (Quail Fields → ICM, Deah Way → North Raleigh Masjid, etc.)
  4. Regex pattern detection for new venues
  5. Venue name extraction from location field
- **Scheduled refresh**: Events cached server-side, refreshed every hour, with 15-min TTL for API requests
- **Business enrichment**: Approved businesses without Google Places data are auto-enriched on startup (15s delay) and daily (24h interval); also triggered immediately when a business is approved via admin dashboard
- **Halal restaurant enrichment**: Halal restaurants without `place_id` are auto-enriched on startup (30s delay) and daily; merges weekdayDescriptions into existing opening_hours without overwriting periods data

## Ticker/Announcement System

- **Dynamic ticker banner** on home screen — scrolling text for community announcements
- Only renders when there are active ticker messages in the database
- Supports 4 message types: info (gold), urgent (red), event, reminder
- Messages can have optional `expires_at` timestamp for auto-expiry
- Refreshes every 60 seconds via React Query
- Manage via admin dashboard at `/admin` (password = SESSION_SECRET)

## Admin Dashboard

- **URL**: `/admin` on the backend (e.g., `https://muslim-life-hub.replit.app/admin`)
- **Auth**: Password login using SESSION_SECRET
- **Features**:
  - Post/remove ticker announcements (type, optional expiration)
  - Send push notifications to all registered devices via Expo Push API
  - Auto-refreshes announcement list every 30 seconds
- **Business review**: View pending/approved/rejected submissions, approve, reject, or permanently delete businesses
- **Push notifications**: App registers Expo push tokens on launch (native only); stored in `push_tokens` table; admin can broadcast to all devices

## Prayer Screen Features

- **Qibla Compass**: Calculates bearing to Kaaba using great-circle formula; rotates with device magnetometer on native, static on web
- **Where Should I Pray?**: Expandable dropdown showing 3 nearest masjids with estimated drive times; each row opens native maps navigation. Uses `getAllMasjidsByDistance()` from prayer-utils
- **Tonight Near You**: Expandable dropdown showing tonight's events (5pm–2am) matched to nearby masjids (top 8 by distance) via `matchEventsToMasjid()`. Only shows events confirmed to be at a recognized masjid
- **Prayer Notifications**: Toggle to schedule local notifications at each prayer time via expo-notifications; preference stored in AsyncStorage via settings context
- **Mosque Proximity Alert**: Checks distance to all known masjids; shows dismissable "silence your phone" banner when within 100m
- **Calculation Method**: Configurable via drawer settings; supports all 12 adhan library methods; default is ISNA (North America)
- **Fonts**: Inter (modern sans-serif) for body text, Playfair Display (serif) for section headers and prayer names — Islamic elegance pairing

## Integrations

- **Google Calendar**: Connected via Replit integration connector for community events calendar
- **Adhan.js**: Client-side prayer time calculation (configurable method, default North America/ISNA)
- **expo-location**: For prayer times accuracy and nearest masjid distance
- **expo-sensors**: Magnetometer for Qibla compass heading (native only)
- **expo-notifications**: Local push notifications for prayer times
- **AsyncStorage**: Persistent storage for theme mode, calculation method, notification preferences

## Dependencies

Key packages: adhan, react-native-webview, expo-location, expo-linear-gradient, googleapis, expo-sensors, expo-notifications, @react-native-async-storage/async-storage, pg, @expo-google-fonts/playfair-display
