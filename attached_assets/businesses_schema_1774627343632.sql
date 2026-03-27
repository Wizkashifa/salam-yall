-- ============================================================
-- Salam Y'all — businesses table (revised schema)
-- ============================================================
-- Changes from original export:
--   specialty            → subcategory          (generalized beyond healthcare)
--   hospital_affiliation → affiliation           (used for law firms, practices, etc.)
--   member_note          → community_badge       (e.g. "Member of NC Muslim Bar")
--   keywords             → filter_tags           (UI filter chips — array)
--   search_tags          → search_aliases        (search synonyms — not shown in UI)
--   + location_type      (physical | service_area | virtual | popup)
--   + service_area_description
--   + featured
--   Columns reordered into logical groups
-- ============================================================

CREATE TABLE businesses (

  -- ── Identity ───────────────────────────────────────────────
  id                  SERIAL PRIMARY KEY,
  name                TEXT        NOT NULL,
  category            TEXT        NOT NULL,
                                            -- 'Automotive' | 'Creator' | 'Events' | 'Food & Drink'
                                            -- 'Grocery' | 'Healthcare' | 'Real Estate' | 'Retail' | 'Services'
  subcategory         TEXT,                 -- e.g. Dermatology, Dentistry, Venue, Photographer
  description         TEXT,                 -- 1-2 sentences, no business name, third person
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('approved', 'pending', 'rejected')),
  featured            BOOLEAN     NOT NULL DEFAULT FALSE,
                                            -- pins to top of category and directory landing

  -- ── Contact / Location ─────────────────────────────────────
  -- location_type drives map display and listing UI:
  --   'physical'     — fixed address, shown on map (default)
  --   'service_area' — travels to client or covers a region, no fixed location
  --   'virtual'      — fully online, no in-person component
  --   'popup'        — no fixed address, appears at rotating physical locations
  location_type            TEXT    NOT NULL DEFAULT 'physical'
                           CHECK (location_type IN ('physical','service_area','virtual','popup')),
  address                  TEXT,            -- NULL for non-physical location types
                                            -- format: "123 Main St, City, NC 12345" — no ", USA"
  service_area_description TEXT,            -- e.g. "Serves the Triangle area"
                                            -- shown in place of address for service_area and popup
  phone                    TEXT,
  website                  TEXT,
  instagram_url            TEXT,
  booking_url              TEXT,
  lat                      DOUBLE PRECISION, -- NULL for non-physical location types
  lng                      DOUBLE PRECISION,

  -- ── Discovery ──────────────────────────────────────────────
  -- filter_tags: shown as UI filter chips — must be from the valid list for this category
  -- plus any universal tags (Women-owned, Arabic-speaking, Urdu-speaking, Spanish-speaking)
  filter_tags         TEXT[]      NOT NULL DEFAULT '{}',

  -- search_aliases: improve search recall, not shown in UI
  -- e.g. ["attorney", "legal", "lawyer"] on a legal listing
  -- e.g. ["dentist", "dental", "teeth"] on a dentistry listing
  search_aliases      TEXT[]      NOT NULL DEFAULT '{}',

  -- ── Community Metadata ─────────────────────────────────────
  -- affiliation: practice, firm, or organization the person operates under
  -- e.g. a solo attorney listing their firm; a provider listing their practice
  affiliation         TEXT,

  -- community_badge: credential or membership shown as a badge on the listing
  -- e.g. "Member of NC Muslim Bar"
  community_badge     TEXT,

  -- ── Media ──────────────────────────────────────────────────
  photo_url           TEXT,

  -- ── Ratings (from Google Places, periodically refreshed) ───
  rating              NUMERIC(3,1),
  user_ratings_total  INTEGER,

  -- ── Audit ──────────────────────────────────────────────────
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX idx_businesses_category        ON businesses (category);
CREATE INDEX idx_businesses_status          ON businesses (status);
CREATE INDEX idx_businesses_featured        ON businesses (featured) WHERE featured = TRUE;
CREATE INDEX idx_businesses_location_type   ON businesses (location_type);
CREATE INDEX idx_businesses_filter_tags     ON businesses USING GIN (filter_tags);
CREATE INDEX idx_businesses_search_aliases  ON businesses USING GIN (search_aliases);

-- ── Universal filter_tags (every category) ─────────────────
-- Women-owned, Arabic-speaking, Urdu-speaking, Spanish-speaking

-- ── filter_tags by category ─────────────────────────────────
--
-- Healthcare:
--   Female provider, Male provider, Accepts insurance, Cash / self-pay,
--   Sliding scale, Telehealth available, Walk-ins welcome, By appointment only,
--   Pediatric, Halal medications, Mental health, Women's health, Sports medicine
--
-- Food & Drink:
--   Halal-certified, Dine-in, Takeout, Delivery, Catering, Late night,
--   Custom orders, Pickup only, Desserts, Savory, Weekly menu,
--   Pre-order required, Available for events
--
-- Events:
--   Indoor venue, Outdoor venue, Halal catering, Photography, Videography,
--   Henna available, Gender-separated option
--
-- Creator:
--   Islamic content, Family-friendly, Education, Available for collabs,
--   Podcast, YouTube, Commission open
--
-- Real Estate:
--   Buyer's agent, Seller's agent, Rental properties, Commercial, Bilingual agent
--
-- Services:
--   Financial planning, By appointment only, Walk-ins welcome, Legal services,
--   Tax preparation, Notary, Translation, IT / Tech support, Home services,
--   Barbershop / Salon, Cleaning services, Landscaping / Lawn care,
--   Tutoring / Education, Childcare / Daycare, Accounting / CPA,
--   Printing / Signage, HVAC, Plumbing, Construction
--
-- Grocery:
--   Halal meat, Zabiha, Imported goods, Middle Eastern, South Asian, African, Bakery
--
-- Automotive:
--   Mechanic / Repair, Dealership, Tires, Detailing, Body shop, Car rental
--
-- Retail:
--   (universal tags only)

-- ── location_type guidance ──────────────────────────────────
-- physical:     show address + map pin. lat/lng required.
-- service_area: hide address, show service_area_description instead. no map pin.
-- virtual:      hide address, surface website/booking_url as primary CTA. no map pin.
-- popup:        hide address, surface instagram_url as primary CTA. no map pin.
--
-- service_area_description examples:
--   "Serves the Triangle area"
--   "Available in Wake & Durham counties"
--   "Based in Cary, also available via telehealth"
--   "Available at local pop-ups — follow on Instagram for locations"

-- ── description guidelines ──────────────────────────────────
-- • 1-2 sentences, ~150 chars
-- • Do not start with the business name
-- • Third person only — never "we" or "our"
-- • Professional and factual — no hype or exclamation marks
-- • Mention city when relevant
-- • Format: "[Type] in [City] offering/providing [what they do], [differentiator]."
