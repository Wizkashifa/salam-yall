# Ummah Connect

## Overview

Ummah Connect is a mobile application designed to serve the Muslim community. It provides essential Islamic resources and community features, including prayer times, halal food directories, event listings, and a business directory. The app aims to be a central hub for Muslims, fostering connection and providing convenient access to relevant local information and services. It is built using Expo (React Native) for the frontend and an Express.js backend, leveraging a PostgreSQL database.

## User Preferences

I prefer clear and concise communication. For development, I favor an iterative approach with frequent, small updates. Please ask for confirmation before implementing any major architectural changes or introducing new external dependencies. I also prefer detailed explanations for complex technical decisions.

## System Architecture

The application follows a client-server architecture:

**Frontend (Expo/React Native):**
- **Routing:** Expo Router with file-based routing and a 5-tab layout: Halal Eats, Events, Home, Directory, and More.
- **State Management:** React Query for server-side data fetching and caching, `useState` for local component state, and `AsyncStorage` for persistent user preferences.
- **Theming:** A `ThemeProvider` context manages dark, light, system, and a special Ramadan mode, allowing user overrides. Color palettes are defined with a rich gold and elegant green, which shifts to purple during Ramadan mode.
- **Settings:** A `SettingsProvider` context manages global settings like prayer calculation methods, notification preferences, and drawer state.
- **UI/UX:** Features glass-effect cards, skeleton loading for improved user experience, and a consistent gradient header design across screens.
- **Components:** Includes a dynamic `TickerBanner` for community announcements and an `AppDrawer` for settings, masjid directory, and feedback.
- **Onboarding:** A 4-screen onboarding flow guides new users through initial setup (location, notifications, preferred masjid).

**Backend (Express.js):**
- **API:** Serves various APIs for events, businesses, halal restaurants, weather, and administrative functions.
- **Google Calendar Integration:** Manages community event fetching and processing, including image extraction, registration URL parsing, and organizer resolution.
- **Business Enrichment:** Automatically enriches submitted businesses and halal restaurants with Google Places data.
- **Admin Dashboard:** Provides an interface for managing ticker messages, sending push notifications, and reviewing business submissions.
- **Deep Linking:** Handles incoming deep links for events, restaurants, and businesses, redirecting to the appropriate in-app content.
- **Share Pages:** Generates shareable HTML pages with Open Graph meta tags for rich link previews of app content.

**Database (PostgreSQL):**
- Stores `ticker_messages`, `push_tokens`, `halal_restaurants`, `businesses`, `jumuah_schedules`, and `iqama_schedules`.
- `iqama_schedules` table: UNIQUE(masjid, date) with columns for fajr, dhuhr, asr, maghrib, isha times. Supports 5 masjids: `"IAR"`, `"ICMNC"`, `"JIAR (Parkwood)"`, `"JIAR (Fayetteville)"`, `"Al Noor"`.

**Iqama Times System:**
- JIAR data is seeded from `server/jiar-iqama-data.ts` (range-based compact format, Mar-Dec 2026). Asr times differ between Parkwood (5:30 PM) and Fayetteville (5:00 PM) campuses.
- IAR times are synced from their API every 6 hours via `server/iqama-scraper.ts`.
- ICMNC times are scraped daily from their website.
- Al Noor times are scraped from `https://alnooric.org/monthly-prayer-times/` (HTML table parsing, deduplicated). Syncs full current month every 6 hours. DB masjid identifier: `"Al Noor"`.
- Frontend fetches 7 days of iqama data via `/api/iqama-times?days=7` and caches in AsyncStorage (`"iqama_cache"` key) for offline access.
- Frontend masjid mapping: preferred masjid containing "al-noor"/"alnoor"/"al noor" → `"Al Noor"` DB identifier.
- Admin CRUD available at `/api/admin/iqama` (GET/POST), `/api/admin/iqama/bulk` (POST), `/api/admin/iqama/:id` (DELETE).

**Key Features:**
- **Home Screen:** Displays prayer times, Qibla direction, weather, daily Quran/Hadith, and "Tonight in the Community" events. Includes an interactive prayer tracker and a search bar.
- **Halal Eats:** A directory of halal restaurants with search, filters, and distance sorting.
- **Events:** Integrates Google Calendar to display community events with registration options.
- **Directory:** A Muslim business directory with category filtering and Google Places integration.
- **More Tab:** Access to prayer tracker, masjid directory, prayer settings, appearance settings, and feedback forms.
- **Prayer Features:** Configurable prayer calculation methods, local notifications, mosque proximity alerts, and Iqama times from various masjids.

## External Dependencies

- **PostgreSQL:** Primary database for storing application data.
- **Google Calendar API:** For fetching and managing community events.
- **Open-Meteo API:** For weather data displayed on the home screen.
- **Google Places API:** Used for enriching business and halal restaurant data (ratings, photos, hours, location).
- **Adhan.js:** A JavaScript library for accurate Islamic prayer time calculations.
- **Expo SDK:** Provides core functionalities like location services (`expo-location`), sensor access (`expo-sensors`), and notifications (`expo-notifications`).
- **AsyncStorage:** For client-side persistent storage of user preferences.
- **googleapis:** Node.js client library for Google APIs, used in backend for calendar interactions.
- **pg:** PostgreSQL client for Node.js.
- **@react-native-async-storage/async-storage:** React Native community package for AsyncStorage.
- **@expo-google-fonts/playfair-display:** For custom font usage.