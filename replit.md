# Salam Y'all

## Overview

Salam Y'all is a mobile application designed to serve the Muslim community. It provides essential Islamic resources and community features, including prayer times, halal food directories, event listings, and a business directory. The app aims to be a central hub for Muslims, fostering connection and providing convenient access to relevant local information and services. It is built using Expo (React Native) for the frontend and an Express.js backend, leveraging a PostgreSQL database.

## User Preferences

I prefer clear and concise communication. For development, I favor an iterative approach with frequent, small updates. Please ask for confirmation before implementing any major architectural changes or introducing new external dependencies. I also prefer detailed explanations for complex technical decisions.

## System Architecture

The application follows a client-server architecture:

**Frontend (Expo/React Native):**
- **Routing:** Expo Router with file-based routing and a 5-tab layout: Halal Eats, Events, Home, Directory, and More.
- **State Management:** React Query for server-side data fetching and caching, `useState` for local component state, and `AsyncStorage` for persistent user preferences.
- **Theming:** A `ThemeProvider` context manages dark, light, system, and a special Ramadan mode, allowing user overrides. Color palettes are defined with a rich gold and elegant green, which shifts to purple during Ramadan mode.
- **Settings:** A `SettingsProvider` context manages global settings like prayer calculation methods, notification preferences, Hijri date offset, Asr madhab (standard/Hanafi), and drawer state.
- **UI/UX:** Features glass-effect cards, skeleton loading for improved user experience, and a consistent gradient header design across screens.
- **Components:** Includes a dynamic `TickerBanner` for community announcements and an `AppDrawer` for settings, masjid directory, and feedback.
- **Onboarding:** A 5-screen onboarding flow guides new users through initial setup (location, notifications, prayer tracker intro, preferred masjid).
- **Travel Mode:** A toggle in settings that hides iqama times and shows only adhan times. Persisted in AsyncStorage (`travel_mode` key). When active, the home screen prayer card shows "Travel Mode — adhan times only" instead of the iqama source.

**Backend (Express.js):**
- **API:** Serves various APIs for events, businesses, halal restaurants, weather, and administrative functions.
- **Google Calendar Integration:** Manages community event fetching and processing, including image extraction, registration URL parsing, and organizer resolution.
- **Business Enrichment:** Automatically enriches submitted businesses and halal restaurants with Google Places data.
- **Admin Dashboard:** Provides an interface for managing ticker messages, sending push notifications, reviewing business submissions, overriding event details, overriding restaurant opening hours (periods), managing analytics, managing the masjid directory, and a flyer scanner for publishing community events via AI extraction. Has 7 tabs: Notifications & Ticker, Janaza, Events (with flyer scanner + email/Instagram ingest + community events + Google Calendar events), Business Submissions, Restaurants, Analytics, Masjids.
- **Event Ingest Agent:** Two AI-powered ingestion endpoints for extracting events: `POST /api/admin/events/ingest-email` (accepts newsletter HTML, max 100KB) and `POST /api/admin/events/ingest-instagram` (accepts public Instagram handle). Both use Claude to extract structured event data (title, date, time, location, description, organizer, registration URL). Extracted events are queued in the admin dashboard for review, editing, and publishing before going live. Events are published via the existing `POST /api/admin/events/publish` flow.
- **Prayer Times Ingest Agent:** AI-powered agentic prayer times extraction. `POST /api/admin/iqama/ingest-agent` starts a background job (returns `{ jobId }`). Claude uses tool-use to autonomously browse the masjid's website (up to 4 pages), extract iqama times, and save them via `save_iqama_times` tool. Progress streams to admin panel in real-time via `GET /api/admin/iqama/ingest-agent/:jobId/stream` (SSE; accepts `?auth=` query param for EventSource). Status polling at `GET /api/admin/iqama/ingest-agent/:jobId`. Up to 20 jobs stored in memory. Admin UI in Masjids tab: masjid name, website URL, timezone selector, Run Agent button, and terminal-style color-coded live log panel with a status badge.
- **Deep Linking:** Handles incoming deep links for events, restaurants, businesses, and janaza alerts, redirecting to the appropriate in-app content.
- **Push Notifications:** Three types: General (broadcast to all), Janaza alerts (proximity-filtered within 50 miles using haversine distance), and Event alerts (deep-link to specific event). Admin dashboard has push type selector.
- **Share Pages:** Generates shareable HTML pages with Open Graph meta tags for rich link previews of app content.

**Database (PostgreSQL):**
- Stores `ticker_messages`, `push_tokens`, `halal_restaurants`, `businesses`, `jumuah_schedules`, `iqama_schedules`, `event_overrides`, `restaurant_overrides`, `janaza_alerts`, and `community_events`.
- `push_tokens` table: Has `lat`, `lng` columns for proximity-based push filtering. Location is sent from client during token registration.
- `janaza_alerts` table: Stores masjid_name, masjid_lat, masjid_lng, details, created_at. Public endpoint: `GET /api/janaza-history` (last 5). Admin: `POST /api/admin/push/janaza`.
- `iqama_schedules` table: UNIQUE(masjid, date) with columns for fajr, dhuhr, asr, maghrib, isha times. Supports 5 masjids: `"IAR"`, `"ICMNC"`, `"JIAR (Parkwood)"`, `"JIAR (Fayetteville)"`, `"Al Noor"`.
- `masjids` table: Stores masjid directory data (name, lat/lon, address, website, match_terms, has_iqama, active, sort_order). Seeded with 13 Triangle-area masjids on startup via `ensureMasjidsTable()`. Public endpoint: `GET /api/masjids` (active only). Admin CRUD: `GET/POST /api/admin/masjids`, `PUT/DELETE /api/admin/masjids/:id`. Frontend fetches from API with `NEARBY_MASJIDS` hardcoded fallback.
- `user_accounts` table: Stores Apple Sign-In users (apple_id, email, display_name). Session tokens stored in-memory on server; persisted via AsyncStorage on client (`auth_session_token` key).
- `user_ratings` table: Community star ratings (1-5) for restaurants and businesses. UNIQUE(user_id, entity_type, entity_id). API: `GET /api/ratings/:entityType/:entityId`, `POST /api/ratings`.
- `halal_checkins` table: Halal verification check-ins with optional comment. API: `GET /api/checkins/:restaurantId`, `POST /api/checkins`.
- `halal_restaurants` has `hours_last_updated TIMESTAMPTZ` column — used for monthly hours refresh from Google Places. Restaurants with stale hours (>30 days or null) get re-fetched on server startup.
- `restaurant_overrides` table: `restaurant_id INTEGER UNIQUE`, `override_periods JSONB`. Admin can override restaurant opening hours periods via the admin dashboard Restaurants tab. Overrides are applied in both the public `/api/halal-restaurants` endpoint and the admin listing. Pattern matches `event_overrides`.

**Iqama Times System:**
- JIAR data is seeded from `server/jiar-iqama-data.ts` (range-based compact format, Mar-Dec 2026). Asr times differ between Parkwood (5:30 PM) and Fayetteville (5:00 PM) campuses.
- IAR times are synced from their API every 6 hours via `server/iqama-scraper.ts`.
- ICMNC times are scraped daily from their website.
- Al Noor times are scraped from `https://alnooric.org/monthly-prayer-times/` (HTML table parsing, deduplicated). Syncs full current month every 6 hours. DB masjid identifier: `"Al Noor"`.
- SRVIC times are synced from DPT plugin API (`srvic.org/wp-json/dpt/v1/prayertime`). Syncs 31 days every 6 hours. DB masjid identifier: `"SRVIC"`.
- MCA times are scraped from `mcabayarea.org/prayerschedule-mca/?month=MM` (HTML table parsing). Syncs full current month; next-month fetch triggered when ≤7 days left. DB masjid identifier: `"MCA"`.
- MCA Al-Noor times are scraped from `mcabayarea.org/prayerschedule-noor/?month=MM` (same parser as MCA via shared `parseMCASchedulePage`). DB masjid identifier: `"MCA Al-Noor"`. Address: 1755 Catherine St, Santa Clara, CA 95050.
- Frontend fetches 7 days of iqama data via `/api/iqama-times?days=7` and caches in AsyncStorage (`"iqama_cache"` key) for offline access.
- Frontend masjid mapping: preferred masjid containing "al-noor"/"alnoor"/"al noor" → `"Al Noor"` DB identifier.
- Masjid directory map centers on user's current location (with animated recentering on native). Masjids with `hasIqama=true` show gold mosque icons in both map markers and list rows, with a legend key under the map.
- Admin CRUD available at `/api/admin/iqama` (GET/POST), `/api/admin/iqama/bulk` (POST), `/api/admin/iqama/:id` (DELETE).

**Key Features:**
- **Home Screen:** Displays prayer times, Qibla direction, weather, daily Quran verse (Arabic + Dr. Mustafa Khattab translation, tappable for Ibn Kathir tafsir modal with share), Jumu'ah card on Fridays, and "Tonight in the Community" events. Includes an interactive prayer tracker and a search bar. Time-sensitive logic (iqama date, event filtering) refreshes every 60 seconds via clockTick.
- **Halal Eats:** A directory of halal restaurants with search, filters, and distance sorting. Action buttons: Call → Website → Directions.
- **Events:** Integrates Google Calendar to display community events with registration options. Also supports admin-published community events (via flyer scanner AI extraction) stored in `community_events` table, merged into the same feed sorted by start time. Flyer images are served via `/api/events/image/:id`.
- **Directory:** A Muslim business directory with category filtering (Food & Drink, Grocery, Retail, Automotive, Real Estate, Healthcare, Services, Events, Creator), subcategory filtering, distance filtering (5/10/25/50 miles via expo-location), Google Places integration, and enhanced submission form with camera roll photo upload (expo-image-picker). Supports subcategory (Healthcare/Automotive/Services/Events/Creator), filter_tags (predefined per category), search_aliases, affiliation (Healthcare), location_type (physical/service_area/virtual/popup), service_area_description (predefined dropdown), featured businesses (gold accent, sorted first). Photo uploads stored in /uploads/ directory. DB columns: `subcategory VARCHAR(255)`, `filter_tags TEXT[]`, `search_aliases TEXT[]`, `affiliation VARCHAR(255)`, `location_type VARCHAR(50)`, `service_area_description TEXT`, `featured BOOLEAN`, `photo_url TEXT`, `booking_url TEXT`.
- **More Tab (Worship):** Access to prayer tracker (with heatmap, onboarding modal), Quran reader, personal growth (prayer stats + Quran stats + badges), masjid directory, athan & alerts, janaza history, dhikr counter, feedback forms, and Apple Sign-In. Worship tab shows a badge (red with missed prayer count, or gold "!" if notifications off). Prayer tracker icon and athan icon also have badges in the menu. During Ramadan, the prayer tracker is renamed to "Fast & Prayer Tracker" and long-press marks missed fasts; outside Ramadan, long-press marks excused prayer days. The athan section shows an inline notification prompt when adhan notifications are disabled, with a link to device settings if permissions were denied.
- **Quran Reader:** Full Quran reader using Quran.com API v4. Browse 114 surahs, read Arabic text with transliteration and multiple selectable English translations (Sahih International, Dr. Mustafa Khattab, Pickthall, Mufti Taqi Usmani, Abdul Haleem). Multi-select dropdown for translations and transliteration toggle. Collapsing banner on scroll (arabic + english inline) with hidden controls for reading focus. Scrolled-past ayahs dim with checkmark to indicate read progress. Khatam tracking with surah-level completion (marks surah read only after scrolling past an ayah). Auto-resume reading position saved to AsyncStorage (`quran_reading_position` key). Full-text search with navigation. Auto-logs daily reading via AsyncStorage (`quran_reading_tracker` key).
- **Prayer Features:** Configurable prayer calculation methods, local notifications, mosque proximity alerts, and Iqama times from various masjids.

## External Dependencies

- **PostgreSQL:** Primary database for storing application data.
- **Google Calendar API:** For fetching and managing community events.
- **Open-Meteo API:** For weather data displayed on the home screen.
- **Google Places API:** Used for enriching business and halal restaurant data (ratings, photos, hours, location).
- **Quran.com API v4:** For Quran text, translations, transliteration, and search functionality.
- **Adhan.js:** A JavaScript library for accurate Islamic prayer time calculations.
- **Expo SDK:** Provides core functionalities like location services (`expo-location`) and notifications (`expo-notifications`).
- **AsyncStorage:** For client-side persistent storage of user preferences.
- **googleapis:** Node.js client library for Google APIs, used in backend for calendar interactions.
- **pg:** PostgreSQL client for Node.js.
- **@react-native-async-storage/async-storage:** React Native community package for AsyncStorage.
- **@expo-google-fonts/playfair-display:** For custom font usage.
- **@anthropic-ai/sdk:** Anthropic Claude API client (via Replit AI Integrations) for flyer image analysis and event data extraction.
- **react-native-shared-group-preferences:** iOS App Group UserDefaults bridge for sharing prayer data with iOS widgets. App Group: `group.app.ummahconnect`.
- **expo-build-properties:** Configures native build settings (iOS frameworks).

**iOS Widget Bridge:**
- `lib/widget-shared-storage.ts` provides `savePrayerTimes()`, `savePrayerCompletion()`, and `getPrayerCompletions()` for writing prayer times and tracking status to iOS App Group shared storage.
- `plugins/withWidgetKit.js` is an Expo config plugin that adds the `WidgetKitHelper` native module (calls `WidgetCenter.shared.reloadAllTimelines()`) and configures the App Group entitlement.
- Data is written on prayer time load, iqama update, and prayer pill press. All calls are no-ops on Android/web.

**iOS Widget Extension:**
- `plugins/withPrayerTimesWidget.js` is an Expo config plugin that injects a full iOS Widget Extension target at prebuild time.
- Widget target: "PrayerTimesWidget" with bundle ID `app.ummahconnect.PrayerTimesWidget`.
- Supports `.systemSmall` (next prayer countdown with status dots) and `.systemMedium` (all 5 prayers with athan/iqama times and interactive toggle buttons).
- Swift source files generated: `PrayerTimesWidget.swift`, `PrayerTimesEntry.swift`, `PrayerTimesProvider.swift`, `PrayerTimesWidgetViews.swift`, `TogglePrayerIntent.swift`.
- Interactive buttons use iOS 17+ AppIntent (`TogglePrayerIntent`) to toggle prayer status directly from the widget (null → completed → at_masjid → null cycle).
- Reads/writes prayer data from `UserDefaults(suiteName: "group.app.ummahconnect")` key `"prayerData"`.
- Uses the app's emerald/gold color scheme with dark/light mode support.
- Deployment target: iOS 17.0. Timeline refreshes every 15 minutes.