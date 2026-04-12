# Salam Y'all

## Overview

Salam Y'all is a mobile application designed to be a central hub for the Muslim community. It provides essential Islamic resources and community features such as accurate prayer times, halal food and business directories, and event listings. The app aims to foster connection and provide convenient access to local information and services, enhancing the daily lives of Muslims.

## User Preferences

I prefer clear and concise communication. For development, I favor an iterative approach with frequent, small updates. Please ask for confirmation before implementing any major architectural changes or introducing new external dependencies. I also prefer detailed explanations for complex technical decisions.

## System Architecture

The application employs a client-server architecture. The frontend is built with Expo (React Native), and the backend uses Express.js with a PostgreSQL database.

**Frontend (Expo/React Native):**
- **UI/UX:** Features a 5-tab layout (Halal Eats, Events, Home, Directory, More), glass-effect cards, skeleton loading, and a consistent gradient header. Theming supports dark, light, system, and a special Ramadan mode with distinct color palettes.
- **State Management:** Uses React Query for server-side data, `useState` for local component state, and `AsyncStorage` for persistent user preferences and offline access.
- **Core Features:** Includes a dynamic `TickerBanner` for announcements, an `AppDrawer` for settings, and a 5-screen onboarding flow.
- **Worship Features:** Integrates a prayer tracker, Quran reader with Khatam tracking and full-text search, Dhikr counter, and configurable prayer settings.
- **Special Modes:** Features a "Travel Mode" to adjust prayer time display and a "Ramadan mode" that renames the prayer tracker to "Fast & Prayer Tracker" and enables long-press to mark missed fasts.
- **Deep Linking:** Handles incoming deep links to various app sections.
- **iOS Widget:** Supports interactive iOS widgets for prayer times, allowing users to toggle prayer status directly from the widget.

**Backend (Express.js):**
- **API:** Provides endpoints for events, businesses, halal restaurants, weather, and administrative functions.
- **Data Enrichment:** Automatically enriches business and halal restaurant submissions with Google Places data.
- **Admin Dashboard:** A comprehensive interface for managing content like ticker messages, push notifications, business and event submissions, restaurant hours, and analytics. It includes AI-powered tools for event ingestion and prayer time extraction.
- **AI-Powered Agents:**
    - **Event Ingest Agent:** Uses Claude to extract structured event data from email newsletters (HTML) and Instagram handles, queuing them for admin review.
    - **Prayer Times Ingest Agent:** Utilizes Claude with tool-use to autonomously browse masjid websites, extract iqama times, and save them to the database, with real-time progress streaming to the admin panel.
- **Push Notifications:** Supports general, Janaza alerts (proximity-filtered), and event alerts (deep-linked).
- **Share Pages:** Generates shareable HTML pages with Open Graph meta tags for rich link previews.

**Database (PostgreSQL):**
- Stores all application data, including `ticker_messages`, `push_tokens`, `halal_restaurants`, `businesses`, `jumuah_schedules`, `iqama_schedules`, `community_events`, `janaza_alerts`, `masjids`, `user_accounts`, `user_ratings`, and `halal_checkins`.
- Designed for proximity-based push notification filtering using `lat` and `lng` columns in `push_tokens`.
- Manages `iqama_schedules` for multiple masjids, with various scraping and syncing mechanisms.
- `halal_restaurants` and `restaurant_overrides` tables manage restaurant opening hours, with overrides applied via the admin dashboard.

**Key Features:**
- **Home Screen:** Displays prayer times, Qibla, weather, daily Quran verse, Jumu'ah card, and local events.
- **Halal Eats:** Directory with search, filters, distance sorting, and integration with Google Places.
- **Events:** Aggregates Google Calendar events and admin-published community events (via AI flyer scanner).
- **Directory:** Comprehensive Muslim business directory with category, subcategory, and distance filtering, Google Places integration, and enhanced submission forms.
- **More Tab (Worship):** Central access to prayer tracker, Quran reader, personal growth features, masjid directory, athan & alerts, janaza history, dhikr counter, and feedback forms.

## External Dependencies

- **PostgreSQL:** Main database.
- **Google Calendar API:** For event management.
- **Open-Meteo API:** For weather data.
- **Google Places API:** For business and restaurant data enrichment.
- **Quran.com API v4:** For Quran text and translations.
- **Adhan.js:** For Islamic prayer time calculations.
- **Expo SDK:** Core mobile development framework and utilities (e.g., `expo-location`, `expo-notifications`).
- **AsyncStorage:** Client-side persistent storage.
- **googleapis:** Google APIs client library for backend.
- **pg:** PostgreSQL client for Node.js.
- **@anthropic-ai/sdk:** Anthropic Claude API for AI-powered event and prayer time extraction.
- **react-native-shared-group-preferences:** For iOS App Group UserDefaults bridge.
- **expo-build-properties:** For configuring native build settings.