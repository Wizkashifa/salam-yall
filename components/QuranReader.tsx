"use no memo";
import React, { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
  ViewToken,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useColorScheme,
  Modal,
  ScrollView,
  Dimensions,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassModalContainer } from "@/components/GlassModal";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  logQuranRead,
  markSurahRead,
  getKhatamProgress,
  resetKhatam,
  saveReadingPosition,
  getReadingPosition,
  saveSurahProgress,
  getSurahProgress,
  logPhysicalSurahReading,
  logPhysicalPageReading,
  addQuranReading,
  type KhatamProgress,
  type ReadingPosition,
} from "@/lib/quran-tracker";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERSES_PER_PAGE = 50;
const API_BASE = "https://api.quran.com/api/v4";
const BANNER_COLLAPSE_THRESHOLD = 30;

const MUSHAF_FONT_SIZE_KEY = "quran_mushaf_font_size";

const TAJWEED_COLORS: Record<string, string> = {
  qalaqah: "#E67E22",
  qalb: "#E67E22",
  ikhfa: "#27AE60",
  ikhfa_shafawi: "#27AE60",
  idgham_w_ghunna: "#1E8449",
  idgham_shafawi: "#1E8449",
  idgham_wo_ghunna: "#17A589",
  ghunna: "#145A32",
  madd_2: "#2E86AB",
  madd_6: "#2E86AB",
  madd_munfasil: "#2E86AB",
  madd_muttasil: "#2E86AB",
  iqlab: "#E74C3C",
  ham_wasl: "#7F8C8D",
  silent: "#7F8C8D",
};

const TRANSLATIONS: { id: number; label: string }[] = [
  { id: 20, label: "Sahih International" },
  { id: 22, label: "Abdullah Yusuf Ali" },
  { id: 19, label: "Pickthall" },
  { id: 84, label: "Mufti Taqi Usmani" },
  { id: 85, label: "Abdul Haleem" },
];

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  emerald: string;
  prayerIconBg: string;
  gold: string;
  divider: string;
}

interface Surah {
  id: number;
  revelation_place: string;
  name_arabic: string;
  name_simple: string;
  translated_name: { name: string };
  verses_count: number;
}

interface VerseTranslation {
  id: number;
  label: string;
  text: string;
}

interface Verse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  transliteration?: string;
  translations: VerseTranslation[];
}

interface SearchResult {
  verse_key: string;
  text: string;
  surah_name?: string;
}

interface ApiWord {
  id?: number;
  position?: number;
  text_uthmani?: string;
  audio_url?: string;
  transliteration?: { text?: string };
}

interface Word {
  id: number;
  position: number;
  text_uthmani: string;
  audio_url: string;
  transliteration?: string;
}

interface ApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  text_uthmani_tajweed?: string;
  words?: ApiWord[];
  translations?: Array<{ resource_id?: number; text?: string }>;
}

interface ApiSearchResult {
  verse_key: string;
  text?: string;
}

type QuranSection = "surahList" | "verseView" | "search" | "mushafView";
type ViewMode = "verses" | "mushaf";
const VIEW_MODE_KEY = "quran_view_mode";
const TOTAL_MUSHAF_PAGES = 604;

interface MushafVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  page_number: number;
}

// ─── Tajweed helpers ────────────────────────────────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n)));
}

interface TajweedSegment {
  text: string;
  color: string | null;
}

function parseTajweedText(rawHtml: string): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  const spanRegex = /<span[^>]+class="([^"]+)"[^>]*>([\s\S]*?)<\/span>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = spanRegex.exec(rawHtml)) !== null) {
    if (match[3] !== undefined) {
      const text = decodeHtmlEntities(match[3]);
      if (text) segments.push({ text, color: null });
    } else {
      const rule = match[1];
      const text = decodeHtmlEntities(match[2]);
      if (text) segments.push({ text, color: TAJWEED_COLORS[rule] ?? null });
    }
  }
  return segments;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface TajweedInlineTextProps {
  tajweedHtml: string;
  defaultColor: string;
  fontSize?: number;
}

function TajweedInlineText({ tajweedHtml, defaultColor, fontSize = 24 }: TajweedInlineTextProps) {
  const segments = parseTajweedText(tajweedHtml);
  return (
    <Text
      style={{
        fontSize,
        lineHeight: fontSize * 1.75,
        textAlign: "right",
        writingDirection: "rtl",
        marginBottom: 12,
      }}
    >
      {segments.map((seg, i) => (
        <Text key={i} style={{ color: seg.color ?? defaultColor }}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

interface WordTapRowProps {
  words: Word[];
  tajweedHtml: string | null;
  showTajweed: boolean;
  playingWordId: string | null;
  verseKey: string;
  onWordTap: (audioUrl: string, wordKey: string) => void;
  defaultTextColor: string;
  goldColor: string;
  fontSize?: number;
}

function WordTapRow({
  words, tajweedHtml, showTajweed, playingWordId, verseKey,
  onWordTap, defaultTextColor, goldColor, fontSize = 24,
}: WordTapRowProps) {
  // Pre-parse tajweed segments for dominant-rule lookup
  const tajweedSegments = showTajweed && tajweedHtml ? parseTajweedText(tajweedHtml) : null;

  const getWordColor = (word: Word): string => {
    const wKey = `${verseKey}:${word.position}`;
    if (playingWordId === wKey) return goldColor;
    if (tajweedSegments) {
      // Find the first tajweed segment whose text appears in this word
      const seg = tajweedSegments.find(s => s.color && word.text_uthmani.includes(s.text));
      if (seg?.color) return seg.color;
    }
    return defaultTextColor;
  };

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      {words.map((word) => {
        const wKey = `${verseKey}:${word.position}`;
        const isPlaying = playingWordId === wKey;
        const wordColor = getWordColor(word);
        return (
          <Pressable
            key={wKey}
            onPress={() => onWordTap(word.audio_url, wKey)}
            style={({ pressed }) => ({
              backgroundColor: pressed || isPlaying ? goldColor + "25" : "transparent",
              borderRadius: 6,
              paddingHorizontal: 3,
              paddingVertical: 2,
              margin: 1,
            })}
          >
            <Text
              style={{
                fontSize,
                lineHeight: fontSize * 1.75,
                color: wordColor,
                writingDirection: "rtl",
                fontFamily: Platform.OS === "web" ? "serif" : undefined,
              }}
            >
              {word.text_uthmani}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface VerseCardProps {
  children: React.ReactNode;
  isHighlighted: boolean;
  isDark: boolean;
  colors: ThemeColors;
}

function VerseCard({ children, isHighlighted, isDark, colors }: VerseCardProps) {
  if (Platform.OS === "ios") {
    return (
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isHighlighted ? colors.emerald + "60" : colors.border,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <BlurView
          intensity={isDark ? 22 : 12}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            (isDark ? "#FFFFFF" : "#000000") + "05",
            (isDark ? "#FFFFFF" : "#000000") + "02",
          ]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: 16 }}>{children}</View>
      </View>
    );
  }
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isHighlighted ? colors.emerald + "60" : colors.border,
        backgroundColor: isHighlighted ? colors.emerald + "15" : colors.surface,
        marginBottom: 10,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

export interface QuranReaderHandle {
  goBack: () => boolean;
}

interface QuranReaderProps {
  colors: ThemeColors;
  onBack: () => void;
}

export const QuranReader = React.forwardRef<QuranReaderHandle, QuranReaderProps>(function QuranReader({ colors, onBack }, ref) {
  const isDark = useColorScheme() === "dark";
  const [qSection, setQSection] = useState<QuranSection>("surahList");
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [surahsLoading, setSurahsLoading] = useState(true);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [versesLoading, setVersesLoading] = useState(false);
  const [versesPage, setVersesPage] = useState(1);
  const [versesHasMore, setVersesHasMore] = useState(false);
  const [selectedTranslationIds, setSelectedTranslationIds] = useState<number[]>([]);
  const [showTransliteration, setShowTransliteration] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [scrollToVerse, setScrollToVerse] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [khatam, setKhatam] = useState<KhatamProgress | null>(null);
  const [readUpToIndex, setReadUpToIndex] = useState(-1);
  const [bannerCollapsed, setBannerCollapsed] = useState(false);
  const [resumePos, setResumePos] = useState<ReadingPosition | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("verses");
  const [mushafPage, setMushafPage] = useState(1);
  const [mushafVerses, setMushafVerses] = useState<MushafVerse[]>([]);
  const [mushafLoading, setMushafLoading] = useState(false);
  const [mushafSurahName, setMushafSurahName] = useState("");
  const [mushafSurahInfo, setMushafSurahInfo] = useState<{ name: string; arabic: string; translation: string } | null>(null);
  const [showPhysicalModal, setShowPhysicalModal] = useState(false);
  const [physicalTab, setPhysicalTab] = useState<"surahs" | "pages">("surahs");
  const [physStartSurah, setPhysStartSurah] = useState(1);
  const [physStartAyah, setPhysStartAyah] = useState(1);
  const [physEndSurah, setPhysEndSurah] = useState(1);
  const [physEndAyah, setPhysEndAyah] = useState(1);
  const [physStartPage, setPhysStartPage] = useState(1);
  const [physEndPage, setPhysEndPage] = useState(1);
  const [mushafError, setMushafError] = useState(false);
  const [mushafPageInput, setMushafPageInput] = useState("");
  const [showSurahPicker, setShowSurahPicker] = useState<"start" | "end" | null>(null);
  const [surahPickerSearch, setSurahPickerSearch] = useState("");
  const mushafFetchId = useRef(0);

  // Word-tap + Tajweed feature state
  const [showWordTap, setShowWordTap] = useState(true);
  const [showTajweed, setShowTajweed] = useState(true);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [mushafFontSize, setMushafFontSize] = useState(22);
  const wordMapRef = useRef<Map<string, Word[]>>(new Map());
  const tajweedMapRef = useRef<Map<string, string>>(new Map());
  const currentSoundRef = useRef<Audio.Sound | null>(null);
  const playingWordIdRef = useRef<string | null>(null);

  const versesListRef = useRef<FlatList>(null);
  const fetchIdRef = useRef(0);
  const readUpToRef = useRef(-1);
  const surahMarkedRef = useRef(false);
  const selectedSurahRef = useRef<Surah | null>(null);
  const lastVisibleVerseRef = useRef<{ key: string; number: number } | null>(null);
  const bannerAnim = useRef(new Animated.Value(1)).current;
  const bannerCollapsedRef = useRef(false);
  const qSectionRef = useRef<QuranSection>("surahList");
  const handleBackRef = useRef<() => void>(() => {});

  useEffect(() => { qSectionRef.current = qSection; }, [qSection]);

  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (qSectionRef.current === "verseView" || qSectionRef.current === "search" || qSectionRef.current === "mushafView") {
        handleBackRef.current();
        return true;
      }
      return false;
    },
  }));

  useEffect(() => {
    selectedSurahRef.current = selectedSurah;
  }, [selectedSurah]);

  useEffect(() => {
    logQuranRead();
    getKhatamProgress().then(setKhatam).catch(() => {});
    getReadingPosition().then(setResumePos).catch(() => {});
    AsyncStorage.getItem(VIEW_MODE_KEY).then(v => {
      if (v === "mushaf") setViewMode("mushaf");
    }).catch(() => {});
    AsyncStorage.getItem(MUSHAF_FONT_SIZE_KEY).then(v => {
      if (v) setMushafFontSize(parseInt(v, 10));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSurahs();
  }, []);

  useEffect(() => {
    return () => {
      const surah = selectedSurahRef.current;
      const lastVerse = lastVisibleVerseRef.current;
      if (surah && lastVerse && lastVerse.number < surah.verses_count) {
        const page = Math.ceil(lastVerse.number / VERSES_PER_PAGE);
        saveReadingPosition({
          surahId: surah.id,
          surahName: surah.name_simple,
          surahNameArabic: surah.name_arabic,
          page,
          verseKey: lastVerse.key,
          verseNumber: lastVerse.number,
          totalVerses: surah.verses_count,
        }).catch(() => {});
      }
    };
  }, []);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentSoundRef.current) {
        currentSoundRef.current.stopAsync().catch(() => {});
        currentSoundRef.current.unloadAsync().catch(() => {});
        currentSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (scrollToVerse && verses.length > 0 && !versesLoading) {
      const idx = verses.findIndex(v => v.verse_key === scrollToVerse);
      if (idx >= 0) {
        setTimeout(() => {
          versesListRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 20 });
        }, 300);
      }
    }
  }, [scrollToVerse, verses, versesLoading]);

  const fetchSurahs = async () => {
    try {
      setSurahsLoading(true);
      setErrorMsg(null);
      const res = await fetch(`${API_BASE}/chapters?language=en`);
      if (!res.ok) throw new Error("Failed to load surahs");
      const data = await res.json();
      setSurahs(data.chapters || []);
    } catch (e: unknown) {
      setSurahs([]);
      const msg = e instanceof Error ? e.message : "Failed to load surahs. Check your connection.";
      setErrorMsg(msg);
    } finally {
      setSurahsLoading(false);
    }
  };

  const fetchVerses = useCallback(async (surahId: number, page: number, transIds: number[], append = false) => {
    const thisId = ++fetchIdRef.current;
    try {
      setVersesLoading(true);
      setErrorMsg(null);
      const fields = "text_uthmani,text_uthmani_tajweed";
      const translationParam = transIds.join(",");

      if (!append) {
        wordMapRef.current.clear();
        tajweedMapRef.current.clear();
      }

      const [translitRes, translitMapRes] = await Promise.all([
        fetch(`${API_BASE}/verses/by_chapter/${surahId}?language=en&fields=${fields}&translation_fields=text,resource_id&translations=${translationParam}&per_page=${VERSES_PER_PAGE}&page=${page}`),
        fetch(`${API_BASE}/verses/by_chapter/${surahId}?language=en&per_page=${VERSES_PER_PAGE}&page=${page}&word_fields=transliteration,audio_url,text_uthmani&words=true`),
      ]);

      if (thisId !== fetchIdRef.current) return;
      if (!translitRes.ok) throw new Error("Failed to load verses");
      const translitData = await translitRes.json();

      const translitMap: Record<string, string> = {};
      if (translitMapRes.ok) {
        const translitMapData = await translitMapRes.json();
        if (translitMapData.verses) {
          for (const v of translitMapData.verses) {
            const words: ApiWord[] = v.words || [];
            const translit = words.map((w: ApiWord) => w.transliteration?.text || "").filter(Boolean).join(" ");
            translitMap[v.verse_key] = translit;
            // Store per-word data for audio + tajweed
            const wordList: Word[] = words
              .filter((w: ApiWord) => w.text_uthmani && w.audio_url)
              .map((w: ApiWord, idx: number) => ({
                id: w.id ?? idx,
                position: w.position ?? idx + 1,
                text_uthmani: w.text_uthmani!,
                audio_url: w.audio_url!,
                transliteration: w.transliteration?.text,
              }));
            wordMapRef.current.set(v.verse_key, wordList);
          }
        }
      }

      // Store tajweed HTML per verse
      for (const v of (translitData.verses || [])) {
        if (v.text_uthmani_tajweed) {
          tajweedMapRef.current.set(v.verse_key, v.text_uthmani_tajweed);
        }
      }

      if (thisId !== fetchIdRef.current) return;

      const parsed: Verse[] = (translitData.verses || []).map((v: ApiVerse) => {
        const vTranslations: VerseTranslation[] = (v.translations || []).map(t => {
          const match = TRANSLATIONS.find(tr => tr.id === t.resource_id);
          return {
            id: t.resource_id ?? 0,
            label: match?.label ?? "Translation",
            text: t.text?.replace(/<[^>]*>/g, "") || "",
          };
        });
        return {
          id: v.id,
          verse_number: v.verse_number,
          verse_key: v.verse_key,
          text_uthmani: v.text_uthmani,
          transliteration: translitMap[v.verse_key] || "",
          translations: vTranslations,
        };
      });

      if (append) {
        setVerses(prev => [...prev, ...parsed]);
      } else {
        setVerses(parsed);
      }

      const pagination = translitData.pagination;
      setVersesHasMore(pagination ? pagination.current_page < pagination.total_pages : false);
      setVersesPage(page);
    } catch (e: unknown) {
      if (thisId !== fetchIdRef.current) return;
      if (!append) setVerses([]);
      const msg = e instanceof Error ? e.message : "Failed to load verses. Check your connection.";
      setErrorMsg(msg);
    } finally {
      if (thisId === fetchIdRef.current) setVersesLoading(false);
    }
  }, []);

  const saveCurrentPosition = useCallback(() => {
    const surah = selectedSurahRef.current;
    const lastVerse = lastVisibleVerseRef.current;
    if (surah && lastVerse && lastVerse.number < surah.verses_count) {
      const page = Math.ceil(lastVerse.number / VERSES_PER_PAGE);
      saveReadingPosition({
        surahId: surah.id,
        surahName: surah.name_simple,
        surahNameArabic: surah.name_arabic,
        page,
        verseKey: lastVerse.key,
        verseNumber: lastVerse.number,
        totalVerses: surah.verses_count,
      }).catch(() => {});
    } else if (surah && lastVerse && lastVerse.number >= surah.verses_count) {
      saveReadingPosition(null).catch(() => {});
      setResumePos(null);
    }
  }, []);

  const handleSelectSurah = useCallback((surah: Surah, resumePage?: number, resumeVerseKey?: string) => {
    // Stop any playing audio and clear maps for previous surah
    if (currentSoundRef.current) {
      currentSoundRef.current.stopAsync().catch(() => {});
      currentSoundRef.current.unloadAsync().catch(() => {});
      currentSoundRef.current = null;
    }
    setPlayingWordId(null);
    playingWordIdRef.current = null;
    wordMapRef.current.clear();
    tajweedMapRef.current.clear();

    setSelectedSurah(surah);
    setQSection("verseView");
    setVerses([]);
    setVersesPage(1);
    surahMarkedRef.current = false;
    lastVisibleVerseRef.current = null;
    setBannerCollapsed(false);
    bannerCollapsedRef.current = false;
    bannerAnim.setValue(1);
    setShowDropdown(false);

    getSurahProgress(surah.id).then((saved) => {
      readUpToRef.current = saved;
      setReadUpToIndex(saved);
    }).catch(() => {
      readUpToRef.current = -1;
      setReadUpToIndex(-1);
    });

    const page = resumePage || 1;
    if (resumeVerseKey) {
      setScrollToVerse(resumeVerseKey);
    } else {
      setScrollToVerse(null);
    }

    fetchVerses(surah.id, page, selectedTranslationIds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [selectedTranslationIds, fetchVerses]);

  const handleResumeReading = useCallback(() => {
    if (!resumePos || surahs.length === 0) return;
    if (viewMode === "mushaf" && resumePos.mushafPage) {
      setQSection("mushafView");
      fetchMushafPage(resumePos.mushafPage);
      return;
    }
    const surah = surahs.find(s => s.id === resumePos.surahId);
    if (surah) {
      handleSelectSurah(surah, resumePos.page, resumePos.verseKey);
    }
  }, [resumePos, surahs, handleSelectSurah, viewMode, fetchMushafPage]);

  const handleToggleTranslation = useCallback((id: number) => {
    setSelectedTranslationIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  const handleApplyTranslations = useCallback(() => {
    setShowDropdown(false);
    if (selectedSurah) {
      setVerses([]);
      fetchVerses(selectedSurah.id, 1, selectedTranslationIds);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [selectedSurah, selectedTranslationIds, fetchVerses]);

  const handleLoadMore = useCallback(() => {
    if (versesHasMore && !versesLoading && selectedSurah) {
      fetchVerses(selectedSurah.id, versesPage + 1, selectedTranslationIds, true);
    }
  }, [versesHasMore, versesLoading, selectedSurah, versesPage, selectedTranslationIds, fetchVerses]);

  const toggleViewMode = useCallback(() => {
    const newMode = viewMode === "verses" ? "mushaf" : "verses";
    setViewMode(newMode);
    AsyncStorage.setItem(VIEW_MODE_KEY, newMode).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [viewMode]);

  const fetchMushafPage = useCallback(async (page: number) => {
    const thisId = ++mushafFetchId.current;
    try {
      setMushafLoading(true);
      setMushafError(false);
      wordMapRef.current.clear();
      tajweedMapRef.current.clear();

      const [res, wordsRes] = await Promise.all([
        fetch(`${API_BASE}/verses/by_page/${page}?language=en&fields=text_uthmani,text_uthmani_tajweed,page_number`),
        fetch(`${API_BASE}/verses/by_page/${page}?language=en&words=true&word_fields=audio_url,text_uthmani`),
      ]);

      if (!res.ok) throw new Error("Failed");
      if (thisId !== mushafFetchId.current) return;
      const data = await res.json();

      // Populate word map from words response
      if (wordsRes.ok) {
        const wordsData = await wordsRes.json();
        for (const v of (wordsData.verses || [])) {
          const wordList: Word[] = (v.words || [])
            .filter((w: ApiWord) => w.text_uthmani && w.audio_url)
            .map((w: ApiWord, idx: number) => ({
              id: w.id ?? idx,
              position: w.position ?? idx + 1,
              text_uthmani: w.text_uthmani!,
              audio_url: w.audio_url!,
            }));
          wordMapRef.current.set(v.verse_key, wordList);
        }
      }

      // Populate tajweed map from main response
      for (const v of (data.verses || [])) {
        if (v.text_uthmani_tajweed) {
          tajweedMapRef.current.set(v.verse_key, v.text_uthmani_tajweed);
        }
      }

      const parsed: MushafVerse[] = (data.verses || []).map((v: any) => ({
        id: v.id,
        verse_number: v.verse_number,
        verse_key: v.verse_key,
        text_uthmani: v.text_uthmani,
        page_number: v.page_number || page,
      }));
      setMushafVerses(parsed);
      setMushafPage(page);
      if (parsed.length > 0) {
        const surahNum = parseInt(parsed[0].verse_key.split(":")[0]);
        const s = surahs.find(s => s.id === surahNum);
        setMushafSurahName(s?.name_simple || `Surah ${surahNum}`);
        setMushafSurahInfo(s ? { name: s.name_simple, arabic: s.name_arabic, translation: s.translated_name.name } : null);
      }
      addQuranReading(1, parsed.length);
    } catch {
      if (thisId === mushafFetchId.current) {
        setMushafError(true);
        setMushafVerses([]);
      }
    } finally {
      if (thisId === mushafFetchId.current) {
        setMushafLoading(false);
      }
    }
  }, [surahs]);

  const handlePhysicalSubmit = useCallback(async () => {
    try {
      if (physicalTab === "surahs") {
        const startSurahData = surahs.find(s => s.id === physStartSurah);
        const endSurahData = surahs.find(s => s.id === physEndSurah);
        const clampedStartAyah = Math.min(physStartAyah, startSurahData?.verses_count || 999);
        const clampedEndAyah = Math.min(physEndAyah, endSurahData?.verses_count || 999);
        if (physEndSurah < physStartSurah || (physEndSurah === physStartSurah && clampedEndAyah < clampedStartAyah)) {
          Alert.alert("Invalid Range", "End position must be after start position.");
          return;
        }
        const verseCounts = surahs.map(s => s.verses_count);
        await logPhysicalSurahReading(physStartSurah, clampedStartAyah, physEndSurah, clampedEndAyah, verseCounts);
      } else {
        if (physEndPage < physStartPage) {
          Alert.alert("Invalid Range", "End page must be after start page.");
          return;
        }
        await logPhysicalPageReading(physStartPage, physEndPage);
      }
      await getKhatamProgress().then(setKhatam);
      setShowPhysicalModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Recorded", "Your physical Quran reading has been logged.");
    } catch {
      Alert.alert("Error", "Failed to save reading.");
    }
  }, [physicalTab, physStartSurah, physStartAyah, physEndSurah, physEndAyah, physStartPage, physEndPage, surahs]);

  const handleBackFromVerses = useCallback(() => {
    try {
      saveCurrentPosition();
    } catch {}
    // Stop audio and clear maps
    if (currentSoundRef.current) {
      currentSoundRef.current.stopAsync().catch(() => {});
      currentSoundRef.current.unloadAsync().catch(() => {});
      currentSoundRef.current = null;
    }
    setPlayingWordId(null);
    playingWordIdRef.current = null;
    setBannerCollapsed(false);
    bannerCollapsedRef.current = false;
    bannerAnim.setValue(1);
    setShowDropdown(false);
    setScrollToVerse(null);
    setQSection("surahList");
    getReadingPosition().then(setResumePos).catch(() => {});
    getKhatamProgress().then(setKhatam).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [saveCurrentPosition, bannerAnim]);

  useEffect(() => { handleBackRef.current = handleBackFromVerses; }, [handleBackFromVerses]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    try {
      setSearchLoading(true);
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&size=20&language=en`);
      const data = await res.json();
      const results: SearchResult[] = (data.search?.results || []).map((r: ApiSearchResult) => ({
        verse_key: r.verse_key,
        text: r.text?.replace(/<[^>]*>/g, "") || "",
      }));

      if (surahs.length > 0) {
        for (const r of results) {
          const surahNum = parseInt(r.verse_key.split(":")[0]);
          const s = surahs.find(s => s.id === surahNum);
          if (s) r.surah_name = s.name_simple;
        }
      }

      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, surahs]);

  const handleSearchResultTap = useCallback((vk: string) => {
    const [surahStr, ayahStr] = vk.split(":");
    const surahNum = parseInt(surahStr);
    const ayahNum = parseInt(ayahStr);
    const surah = surahs.find(s => s.id === surahNum);
    if (surah) {
      const targetPage = Math.ceil(ayahNum / VERSES_PER_PAGE);
      setSelectedSurah(surah);
      setQSection("verseView");
      setScrollToVerse(vk);
      setVerses([]);
      surahMarkedRef.current = false;
      setBannerCollapsed(false);
      bannerCollapsedRef.current = false;
      bannerAnim.setValue(1);
      setShowDropdown(false);

      getSurahProgress(surah.id).then((saved) => {
        readUpToRef.current = saved;
        setReadUpToIndex(saved);
      }).catch(() => {
        readUpToRef.current = -1;
        setReadUpToIndex(-1);
      });

      fetchVerses(surah.id, targetPage, selectedTranslationIds);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [surahs, selectedTranslationIds, fetchVerses]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldCollapse = y > BANNER_COLLAPSE_THRESHOLD;
    if (shouldCollapse !== bannerCollapsedRef.current) {
      bannerCollapsedRef.current = shouldCollapse;
      setBannerCollapsed(shouldCollapse);
      Animated.timing(bannerAnim, {
        toValue: shouldCollapse ? 0 : 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [bannerAnim]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const versesRef = useRef<Verse[]>([]);
  const versesHasMoreRef = useRef(false);

  useEffect(() => {
    versesRef.current = verses;
  }, [verses]);

  useEffect(() => {
    versesHasMoreRef.current = versesHasMore;
  }, [versesHasMore]);

  useEffect(() => {
    if (readUpToIndex >= 0 && selectedSurah) {
      saveSurahProgress(selectedSurah.id, readUpToIndex);
    }
  }, [readUpToIndex, selectedSurah]);

  const triggerSurahMarked = () => {
    if (!surahMarkedRef.current) {
      surahMarkedRef.current = true;
      const surah = selectedSurahRef.current;
      if (surah) {
        markSurahRead(surah.id).then((progress) => {
          setKhatam(progress);
          if (progress.isComplete) {
            Alert.alert("Khatam Complete!", `You've completed your Quran reading! This is khatam #${progress.completedKhatams}.`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }).catch(() => {});
      }
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length === 0) return;

    const validItems = viewableItems.filter(v => v.index !== null && v.item);
    if (validItems.length === 0) return;

    const indices = validItems.map(v => v.index as number);
    const minVisible = Math.min(...indices);
    const maxVisible = Math.max(...indices);

    const lastItem = validItems.find(v => v.index === maxVisible);
    if (lastItem?.item) {
      const verse = lastItem.item as Verse;
      lastVisibleVerseRef.current = {
        key: verse.verse_key,
        number: verse.verse_number,
      };
    }

    const totalLoaded = versesRef.current.length;
    const isLastVisible = maxVisible >= totalLoaded - 1;
    const noMorePages = !versesHasMoreRef.current;

    if (isLastVisible && noMorePages && totalLoaded > 0) {
      const allRead = totalLoaded - 1;
      if (allRead > readUpToRef.current) {
        readUpToRef.current = allRead;
        setReadUpToIndex(allRead);
        triggerSurahMarked();
      }
    } else if (minVisible > 0) {
      const newRead = minVisible - 1;
      if (newRead > readUpToRef.current) {
        readUpToRef.current = newRead;
        setReadUpToIndex(newRead);
        triggerSurahMarked();
      }
    }
  }).current;


  const selectedTranslationLabels = useMemo(() => {
    return TRANSLATIONS.filter(t => selectedTranslationIds.includes(t.id)).map(t => t.label);
  }, [selectedTranslationIds]);

  const renderSurahItem = useCallback(({ item }: { item: Surah }) => {
    const isRead = khatam?.readSurahIds.includes(item.id) ?? false;
    const isCurrent = !isRead && resumePos?.surahId === item.id;
    return (
      <Pressable
        style={({ pressed }) => [
          qStyles.surahItem,
          { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: isRead ? colors.emerald + "40" : isCurrent ? colors.gold + "40" : colors.border },
        ]}
        onPress={() => handleSelectSurah(item)}
        testID={`surah-${item.id}`}
      >
        <View style={[qStyles.surahNumber, { backgroundColor: isRead ? colors.emerald + "20" : isCurrent ? colors.gold + "20" : colors.prayerIconBg }]}>
          {isRead ? (
            <View style={[qStyles.surahDot, { backgroundColor: colors.emerald }]} />
          ) : isCurrent ? (
            <View style={[qStyles.surahDot, { backgroundColor: colors.gold }]} />
          ) : (
            <Text style={[qStyles.surahNumberText, { color: colors.emerald }]}>{item.id}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[qStyles.surahName, { color: colors.text }]}>{item.name_simple}</Text>
          <Text style={[qStyles.surahMeta, { color: colors.textSecondary }]}>
            {item.translated_name.name} · {item.verses_count} verses · {item.revelation_place === "makkah" ? "Meccan" : "Medinan"}
          </Text>
        </View>
        <Text style={[qStyles.surahArabic, { color: colors.text }]}>{item.name_arabic}</Text>
      </Pressable>
    );
  }, [colors, handleSelectSurah, khatam, resumePos]);

  const playWordAudio = useCallback(async (audioUrl: string, wordKey: string) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {});
      if (currentSoundRef.current) {
        await currentSoundRef.current.stopAsync().catch(() => {});
        await currentSoundRef.current.unloadAsync().catch(() => {});
        currentSoundRef.current = null;
      }
      setPlayingWordId(wordKey);
      playingWordIdRef.current = wordKey;
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );
      currentSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          if (playingWordIdRef.current === wordKey) {
            setPlayingWordId(null);
            playingWordIdRef.current = null;
          }
          sound.unloadAsync().catch(() => {});
          if (currentSoundRef.current === sound) currentSoundRef.current = null;
        }
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setPlayingWordId(null);
      playingWordIdRef.current = null;
    }
  }, []);

  const handleMushafFontSize = useCallback((delta: number) => {
    setMushafFontSize(prev => {
      const next = Math.min(36, Math.max(16, prev + delta));
      AsyncStorage.setItem(MUSHAF_FONT_SIZE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const renderVerseItem = useCallback(({ item, index }: { item: Verse; index: number }) => {
    const isHighlighted = scrollToVerse === item.verse_key;
    const isRead = index <= readUpToIndex;
    const isCurrent = !isRead && index === readUpToIndex + 1;
    const dotColor = isRead ? colors.emerald : isCurrent ? colors.gold : "transparent";

    const words = wordMapRef.current.get(item.verse_key) ?? [];
    const tajweedHtml = tajweedMapRef.current.get(item.verse_key) ?? null;
    const hasWords = words.length > 0;
    const useWordTap = showWordTap && hasWords;
    const useTajweed = showTajweed && tajweedHtml !== null;
    const arabicMarginBottom = showTransliteration && item.transliteration ? 6 : 12;

    return (
      <VerseCard isHighlighted={isHighlighted} isDark={isDark} colors={colors}>
        <View testID={`verse-${item.verse_key}`}>
          <View style={qStyles.verseHeader}>
            <View style={[qStyles.verseNumCircle, { backgroundColor: colors.gold + "18", borderColor: colors.gold + "55" }]}>
              <Text style={[qStyles.verseNumText, { color: colors.gold }]}>{item.verse_number}</Text>
            </View>
            {(isRead || isCurrent) && (
              <View style={[qStyles.readDot, { backgroundColor: dotColor }]} />
            )}
          </View>

          {useWordTap ? (
            <WordTapRow
              words={words}
              tajweedHtml={tajweedHtml}
              showTajweed={useTajweed}
              playingWordId={playingWordId}
              verseKey={item.verse_key}
              onWordTap={playWordAudio}
              defaultTextColor={colors.text}
              goldColor={colors.gold}
            />
          ) : useTajweed ? (
            <TajweedInlineText
              tajweedHtml={tajweedHtml!}
              defaultColor={colors.text}
            />
          ) : (
            <Text style={[qStyles.arabicText, { color: colors.text, marginBottom: arabicMarginBottom }]}>
              {item.text_uthmani}
            </Text>
          )}

          {showTransliteration && item.transliteration ? (
            <Text style={[qStyles.translitText, { color: colors.textSecondary }]}>{item.transliteration}</Text>
          ) : null}
          {item.translations.map((t) => (
            <View key={t.id} style={qStyles.translationBlock}>
              {item.translations.length > 1 && (
                <Text style={[qStyles.translationLabel, { color: colors.textTertiary }]}>{t.label}</Text>
              )}
              <Text style={[qStyles.translationText, { color: colors.textSecondary }]}>{t.text}</Text>
            </View>
          ))}
        </View>
      </VerseCard>
    );
  }, [colors, isDark, showTransliteration, scrollToVerse, readUpToIndex, showWordTap, showTajweed, playingWordId, playWordAudio]);

  const bannerHeight = bannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 88],
  });

  const surahListHeader = useMemo(() => (
    <>
      {resumePos && (
        <Pressable
          style={[qStyles.resumeCard, { backgroundColor: colors.emerald + "12", borderColor: colors.emerald + "40" }]}
          onPress={handleResumeReading}
        >
          <View style={[qStyles.resumeIcon, { backgroundColor: colors.emerald + "20" }]}>
            <Ionicons name="bookmark" size={18} color={colors.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[qStyles.resumeTitle, { color: colors.text }]}>Continue Reading</Text>
            <Text style={[qStyles.resumeSub, { color: colors.textSecondary }]}>
              {resumePos.surahName} · {viewMode === "mushaf" && resumePos.mushafPage ? `Page ${resumePos.mushafPage}` : `Ayah ${resumePos.verseNumber} of ${resumePos.totalVerses}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.emerald} />
        </Pressable>
      )}

      {khatam && (
          <View style={[qStyles.resumeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={[qStyles.resumeTitle, { color: colors.text }]}>Khatam Progress</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.emerald }}>
                  {Math.round((khatam.completedCount / khatam.totalSurahs) * 100)}%
                </Text>
              </View>
              <Text style={[qStyles.resumeSub, { color: colors.textSecondary }]}>
                {khatam.completedCount} of {khatam.totalSurahs} surahs read
                {khatam.completedKhatams > 0 ? ` · ${khatam.completedKhatams} completed` : ""}
              </Text>
              <View style={[qStyles.progressTrack, { backgroundColor: colors.border, marginTop: 8 }]}>
                <View
                  style={[
                    qStyles.progressFill,
                    { backgroundColor: colors.emerald, width: `${Math.round((khatam.completedCount / khatam.totalSurahs) * 100)}%` },
                  ]}
                />
              </View>
              {khatam.completedCount > 0 && (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Reset Progress",
                      "Start a new khatam? Your completed khatam count will be preserved.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Reset",
                          style: "destructive",
                          onPress: () => {
                            resetKhatam().then(() => getKhatamProgress().then(setKhatam)).catch(() => {});
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={[qStyles.khatamReset, { color: colors.textTertiary }]}>Reset progress</Text>
                </Pressable>
              )}
            </View>
          </View>
      )}

    </>
  ), [resumePos, khatam, colors, handleResumeReading]);

  const filteredPickerSurahs = useMemo(() => {
    if (!surahPickerSearch.trim()) return surahs;
    const q = surahPickerSearch.toLowerCase();
    return surahs.filter(s => s.name_simple.toLowerCase().includes(q) || String(s.id).includes(q));
  }, [surahs, surahPickerSearch]);

  if (qSection === "search") {
    return (
      <View style={{ flex: 1 }}>
        <Pressable
          style={qStyles.backRow}
          onPress={() => { setQSection("surahList"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={[qStyles.backLabel, { color: colors.text }]}>Search Quran</Text>
        </Pressable>

        <View style={[qStyles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[qStyles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search verses..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoFocus
            testID="quran-search-input"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {searchLoading ? (
          <ActivityIndicator size="small" color={colors.emerald} style={{ marginTop: 24 }} />
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.verse_key}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  qStyles.searchResultItem,
                  { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface, borderColor: colors.border },
                ]}
                onPress={() => handleSearchResultTap(item.verse_key)}
                testID={`search-result-${item.verse_key}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <View style={[qStyles.verseNumBadge, { backgroundColor: colors.prayerIconBg }]}>
                    <Text style={[qStyles.verseNumText, { color: colors.emerald }]}>{item.verse_key}</Text>
                  </View>
                  {item.surah_name && (
                    <Text style={[qStyles.searchSurahName, { color: colors.text }]}>{item.surah_name}</Text>
                  )}
                </View>
                <Text style={[qStyles.searchResultText, { color: colors.textSecondary }]} numberOfLines={3}>
                  {item.text}
                </Text>
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
            scrollEnabled={searchResults.length > 0}
          />
        ) : searchQuery.trim() && !searchLoading ? (
          <View style={qStyles.emptyState}>
            <Ionicons name="search-outline" size={32} color={colors.textSecondary} />
            <Text style={[qStyles.emptyText, { color: colors.textSecondary }]}>No results found</Text>
          </View>
        ) : (
          <View style={qStyles.emptyState}>
            <Ionicons name="book-outline" size={32} color={colors.textSecondary} />
            <Text style={[qStyles.emptyText, { color: colors.textSecondary }]}>Search across all translations</Text>
          </View>
        )}
      </View>
    );
  }

  if (qSection === "verseView" && selectedSurah) {
    return (
      <View style={{ flex: 1 }}>
        <View style={qStyles.verseViewHeader}>
          <Pressable style={qStyles.backBtn} onPress={handleBackFromVerses}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <View style={qStyles.headerTitleArea}>
            {bannerCollapsed ? (
              <View style={qStyles.collapsedBanner}>
                <Text numberOfLines={1}>
                  <Text style={[qStyles.collapsedAccent, { color: isDark ? colors.gold : colors.emerald }]}>{selectedSurah.name_simple}</Text>
                  <Text style={[qStyles.collapsedSep, { color: colors.textTertiary }]}>  ·  </Text>
                  <Text style={[qStyles.collapsedArabic, { color: colors.text }]}>{selectedSurah.name_arabic}</Text>
                  <Text style={[qStyles.collapsedSep, { color: colors.textTertiary }]}>  ·  </Text>
                  <Text style={[qStyles.collapsedName, { color: colors.textSecondary }]}>{selectedSurah.translated_name.name}</Text>
                </Text>
              </View>
            ) : (
              <Text style={[qStyles.backLabel, { color: colors.text }]} numberOfLines={1}>
                {selectedSurah.name_simple}
              </Text>
            )}
          </View>

          <Pressable
            style={[qStyles.dropdownToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowDropdown(!showDropdown)}
          >
            <Ionicons name="options-outline" size={18} color={colors.emerald} />
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Animated.View style={[qStyles.bannerAnimWrap, { height: bannerHeight, backgroundColor: colors.emerald, borderColor: colors.emerald }]}>
          <View style={qStyles.surahBannerInner}>
            <Text style={[qStyles.bannerArabic, { color: "#FFFFFF" }]}>{selectedSurah.name_arabic}</Text>
            <Text style={[qStyles.bannerEnglish, { color: "rgba(255,255,255,0.8)" }]}>
              {selectedSurah.translated_name.name} · {selectedSurah.verses_count} verses
            </Text>
          </View>
        </Animated.View>

        {showDropdown && (
          <View style={[qStyles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[qStyles.dropdownSectionTitle, { color: colors.textTertiary }]}>Translations</Text>
            {TRANSLATIONS.map(t => {
              const isSelected = selectedTranslationIds.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  style={[qStyles.dropdownOption, isSelected && { backgroundColor: colors.emerald + "10" }]}
                  onPress={() => handleToggleTranslation(t.id)}
                >
                  <Ionicons
                    name={isSelected ? "checkbox" : "square-outline"}
                    size={20}
                    color={isSelected ? colors.emerald : colors.textTertiary}
                  />
                  <Text style={[qStyles.dropdownOptionText, { color: isSelected ? colors.emerald : colors.text }]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}

            <View style={[qStyles.dropdownDivider, { backgroundColor: colors.border }]} />

            <Pressable
              style={[qStyles.dropdownOption, showTransliteration && { backgroundColor: colors.emerald + "10" }]}
              onPress={() => {
                setShowTransliteration(!showTransliteration);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons
                name={showTransliteration ? "checkbox" : "square-outline"}
                size={20}
                color={showTransliteration ? colors.emerald : colors.textTertiary}
              />
              <Text style={[qStyles.dropdownOptionText, { color: showTransliteration ? colors.emerald : colors.text }]}>
                Transliteration
              </Text>
            </Pressable>

            <View style={[qStyles.dropdownDivider, { backgroundColor: colors.border }]} />

            <Pressable
              style={[qStyles.dropdownOption, showWordTap && { backgroundColor: colors.gold + "10" }]}
              onPress={() => {
                setShowWordTap(prev => !prev);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons
                name={showWordTap ? "volume-high" : "volume-high-outline"}
                size={20}
                color={showWordTap ? colors.gold : colors.textTertiary}
              />
              <Text style={[qStyles.dropdownOptionText, { color: showWordTap ? colors.gold : colors.text }]}>
                Word Audio
              </Text>
            </Pressable>

            <Pressable
              style={[qStyles.dropdownOption, showTajweed && { backgroundColor: "#E67E2210" }]}
              onPress={() => {
                setShowTajweed(prev => !prev);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons
                name={showTajweed ? "color-palette" : "color-palette-outline"}
                size={20}
                color={showTajweed ? "#E67E22" : colors.textTertiary}
              />
              <Text style={[qStyles.dropdownOptionText, { color: showTajweed ? "#E67E22" : colors.text }]}>
                Tajweed Colors
              </Text>
            </Pressable>

            <Pressable
              style={[qStyles.applyBtn, { backgroundColor: colors.emerald }]}
              onPress={handleApplyTranslations}
            >
              <Text style={qStyles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        )}

        <View style={qStyles.activeFiltersRow}>
          <Text style={[qStyles.activeFiltersText, { color: colors.textTertiary }]} numberOfLines={1}>
            {selectedTranslationLabels.join(", ")}{showTransliteration ? " + Transliteration" : ""}{showWordTap ? " + Word Audio" : ""}{showTajweed ? " + Tajweed" : ""}
          </Text>
        </View>

        {versesLoading && verses.length === 0 ? (
          <ActivityIndicator size="small" color={colors.emerald} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            ref={versesListRef}
            data={verses}
            keyExtractor={(item) => item.verse_key}
            renderItem={renderVerseItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            ListFooterComponent={
              versesLoading && verses.length > 0 ? (
                <ActivityIndicator size="small" color={colors.emerald} style={{ marginVertical: 16 }} />
              ) : !versesHasMore && verses.length > 0 && readUpToIndex >= verses.length - 1 ? (
                <View style={[qStyles.surahCompleteFooter, { backgroundColor: colors.emerald + "12", borderColor: colors.emerald + "30" }]}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.emerald} />
                  <Text style={[qStyles.surahCompleteText, { color: colors.emerald }]}>Surah complete</Text>
                </View>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 40 }}
            scrollEnabled={verses.length > 0}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                versesListRef.current?.scrollToIndex({ index: info.index, animated: true, viewOffset: 20 });
              }, 500);
            }}
          />
        )}
      </View>
    );
  }

  if (qSection === "mushafView") {
    return (
      <View style={{ flex: 1 }}>
        <View style={qStyles.verseViewHeader}>
          <Pressable style={qStyles.backBtn} onPress={async () => {
            if (mushafVerses.length > 0) {
              const firstVerse = mushafVerses[0];
              const sid = parseInt(firstVerse.verse_key.split(":")[0]);
              const surah = surahs.find(s => s.id === sid);
              if (surah) {
                try {
                  await saveReadingPosition({
                    surahId: surah.id,
                    surahName: surah.name_simple,
                    surahNameArabic: surah.name_arabic,
                    page: 1,
                    verseKey: firstVerse.verse_key,
                    verseNumber: firstVerse.verse_number,
                    totalVerses: surah.verses_count,
                    mushafPage,
                  });
                } catch {}
              }
            }
            getReadingPosition().then(setResumePos).catch(() => {});
            setQSection("surahList");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={qStyles.headerTitleArea}>
            {mushafSurahInfo ? (
              <View style={qStyles.collapsedBanner}>
                <Text numberOfLines={1}>
                  <Text style={[qStyles.collapsedAccent, { color: isDark ? colors.gold : colors.emerald }]}>{mushafSurahInfo.name}</Text>
                  <Text style={[qStyles.collapsedSep, { color: colors.textTertiary }]}>  ·  </Text>
                  <Text style={[qStyles.collapsedArabic, { color: colors.text }]}>{mushafSurahInfo.arabic}</Text>
                  <Text style={[qStyles.collapsedSep, { color: colors.textTertiary }]}>  ·  </Text>
                  <Text style={[qStyles.collapsedName, { color: colors.textSecondary }]}>{mushafSurahInfo.translation}</Text>
                </Text>
              </View>
            ) : (
              <Text style={[qStyles.backLabel, { color: colors.text }]} numberOfLines={1}>
                Page {mushafPage}
              </Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4, gap: 6 }}>
          <Pressable
            style={{ opacity: mushafPage <= 1 ? 0.3 : 1, padding: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
            onPress={() => { if (mushafPage > 1) fetchMushafPage(mushafPage - 1); }}
            disabled={mushafPage <= 1}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.textSecondary }}>
            {mushafPage} / {TOTAL_MUSHAF_PAGES}
          </Text>
          {/* Font size controls */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable
              style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, opacity: mushafFontSize <= 16 ? 0.4 : 1 }}
              onPress={() => handleMushafFontSize(-2)}
              disabled={mushafFontSize <= 16}
            >
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text }}>A−</Text>
            </Pressable>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, minWidth: 28, textAlign: "center" }}>{mushafFontSize}</Text>
            <Pressable
              style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, opacity: mushafFontSize >= 36 ? 0.4 : 1 }}
              onPress={() => handleMushafFontSize(2)}
              disabled={mushafFontSize >= 36}
            >
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: colors.text }}>A+</Text>
            </Pressable>
          </View>
          <Pressable
            style={{ opacity: mushafPage >= TOTAL_MUSHAF_PAGES ? 0.3 : 1, padding: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
            onPress={() => { if (mushafPage < TOTAL_MUSHAF_PAGES) fetchMushafPage(mushafPage + 1); }}
            disabled={mushafPage >= TOTAL_MUSHAF_PAGES}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        {mushafLoading ? (
          <ActivityIndicator size="small" color={colors.emerald} style={{ marginTop: 24 }} />
        ) : mushafError ? (
          <View style={{ alignItems: "center", marginTop: 40, gap: 12 }}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textSecondary} />
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary }}>Failed to load page</Text>
            <Pressable style={{ backgroundColor: colors.emerald, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }} onPress={() => fetchMushafPage(mushafPage)}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}>
            {(() => {
              const toArabicNumeral = (n: number): string => {
                const digits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
                return n.toString().split('').map(d => digits[parseInt(d)]).join('');
              };
              const groups: { surahId: number; surahName: string; startsNewSurah: boolean; verses: typeof mushafVerses }[] = [];
              let currentSurahId = -1;
              for (const v of mushafVerses) {
                const sid = parseInt(v.verse_key.split(":")[0]);
                if (sid !== currentSurahId) {
                  const surah = surahs.find(s => s.id === sid);
                  groups.push({ surahId: sid, surahName: surah?.name_arabic || "", startsNewSurah: v.verse_number === 1, verses: [v] });
                  currentSurahId = sid;
                } else {
                  groups[groups.length - 1].verses.push(v);
                }
              }
              return groups.map((group, gi) => (
                <View key={`group-${gi}`}>
                  {group.startsNewSurah && group.surahId !== 1 && (
                    <View style={{ alignItems: "center", marginTop: gi > 0 ? 24 : 16, marginBottom: 16 }}>
                      <View style={{ width: "100%", borderWidth: 1.5, borderColor: colors.emerald + "30", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", backgroundColor: colors.emerald + "08" }}>
                        <Text style={{ fontSize: 28, color: colors.text, textAlign: "center" }}>
                          {group.surahName}
                        </Text>
                      </View>
                      {group.surahId !== 9 && (
                        <Text style={{ fontSize: 22, color: colors.text, textAlign: "center", marginTop: 16, lineHeight: 40 }}>
                          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                        </Text>
                      )}
                    </View>
                  )}
                  {group.startsNewSurah && group.surahId === 1 && (
                    <View style={{ alignItems: "center", marginTop: 16, marginBottom: 16 }}>
                      <View style={{ width: "100%", borderWidth: 1.5, borderColor: colors.emerald + "30", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", backgroundColor: colors.emerald + "08" }}>
                        <Text style={{ fontSize: 28, color: colors.text, textAlign: "center" }}>
                          {group.surahName}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 22, color: colors.text, textAlign: "center", marginTop: 16, lineHeight: 40 }}>
                        بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                      </Text>
                    </View>
                  )}
                  {showWordTap ? (
                    // Word-tap mode: per-verse word rows with verse number ornament after each
                    <View>
                      {group.verses.map((v) => {
                        const vWords = wordMapRef.current.get(v.verse_key) ?? [];
                        const vTajweed = tajweedMapRef.current.get(v.verse_key) ?? null;
                        return (
                          <View key={v.id} style={{ marginBottom: 4 }}>
                            {vWords.length > 0 ? (
                              <WordTapRow
                                words={vWords}
                                tajweedHtml={vTajweed}
                                showTajweed={showTajweed}
                                playingWordId={playingWordId}
                                verseKey={v.verse_key}
                                onWordTap={playWordAudio}
                                defaultTextColor={colors.text}
                                goldColor={colors.gold}
                                fontSize={mushafFontSize}
                              />
                            ) : (
                              <Text style={{ fontSize: mushafFontSize, lineHeight: mushafFontSize * 1.9, textAlign: "right", color: colors.text, writingDirection: "rtl" }}>
                                {v.text_uthmani}
                              </Text>
                            )}
                            <Text style={{ fontSize: mushafFontSize * 0.75, color: colors.emerald, textAlign: "right" }}>
                              {"\uFD3F" + toArabicNumeral(v.verse_number) + "\uFD3E"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : showTajweed ? (
                    // Tajweed-only: inline colored spans, preserves continuous flow
                    <Text style={{ fontSize: mushafFontSize, lineHeight: mushafFontSize * 1.9, textAlign: "right", writingDirection: "rtl" }}>
                      {group.verses.map((v) => {
                        const vTajweed = tajweedMapRef.current.get(v.verse_key);
                        const segments = vTajweed ? parseTajweedText(vTajweed) : null;
                        return (
                          <React.Fragment key={v.id}>
                            {segments ? segments.map((seg, si) => (
                              <Text key={si} style={{ color: seg.color ?? colors.text }}>{seg.text}</Text>
                            )) : (
                              <Text style={{ color: colors.text }}>{v.text_uthmani}</Text>
                            )}
                            <Text style={{ fontSize: mushafFontSize * 0.75, color: colors.emerald }}>{" \uFD3F" + toArabicNumeral(v.verse_number) + "\uFD3E "}</Text>
                          </React.Fragment>
                        );
                      })}
                    </Text>
                  ) : (
                    // Default: single flowing text block
                    <Text style={{ fontSize: mushafFontSize, lineHeight: mushafFontSize * 1.9, textAlign: "right", color: colors.text, writingDirection: "rtl" }}>
                      {group.verses.map((v, vi) => (
                        <React.Fragment key={v.id}>
                          <Text>{v.text_uthmani}</Text>
                          <Text style={{ fontSize: mushafFontSize * 0.75, color: colors.emerald }}>{" \uFD3F" + toArabicNumeral(v.verse_number) + "\uFD3E "}</Text>
                        </React.Fragment>
                      ))}
                    </Text>
                  )}
                </View>
              ));
            })()}
          </ScrollView>
        )}
      </View>
    );
  }

  const physicalReadingModal = (
    <Modal visible={showPhysicalModal} transparent animationType="slide" onRequestClose={() => { setShowPhysicalModal(false); setShowSurahPicker(null); setSurahPickerSearch(""); }}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => { Keyboard.dismiss(); setShowPhysicalModal(false); setShowSurahPicker(null); setSurahPickerSearch(""); }}>
        <Pressable onPress={() => Keyboard.dismiss()}>
          <GlassModalContainer style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: Dimensions.get("window").height * 0.7, flex: 0 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, textAlign: "center", marginBottom: 16 }}>Add Physical Reading</Text>

            <View style={{ flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 3, marginBottom: 20 }}>
              {(["surahs", "pages"] as const).map(t => (
                <Pressable key={t} onPress={() => { Keyboard.dismiss(); setPhysicalTab(t); }} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: physicalTab === t ? colors.emerald : "transparent", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: physicalTab === t ? "#fff" : colors.textSecondary }}>
                    {t === "surahs" ? "Surahs Read" : "Pages Completed"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {showSurahPicker !== null ? (
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                  <Pressable onPress={() => { setShowSurahPicker(null); setSurahPickerSearch(""); }} style={{ padding: 4 }}>
                    <Ionicons name="chevron-back" size={20} color={colors.text} />
                  </Pressable>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, flex: 1, textAlign: "center", marginRight: 24 }}>
                    Select {showSurahPicker === "start" ? "Start" : "End"} Surah
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, marginBottom: 8 }}>
                  <Ionicons name="search" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 10, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.text }}
                    placeholder="Search surah..."
                    placeholderTextColor={colors.textTertiary}
                    value={surahPickerSearch}
                    onChangeText={setSurahPickerSearch}
                    autoFocus
                    returnKeyType="search"
                  />
                </View>
                <FlatList
                  data={filteredPickerSurahs}
                  keyExtractor={s => String(s.id)}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: Dimensions.get("window").height * 0.35 }}
                  renderItem={({ item: s }) => (
                    <Pressable
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border + "30", gap: 12 }}
                      onPress={() => {
                        if (showSurahPicker === "start") {
                          setPhysStartSurah(s.id);
                          setPhysStartAyah(1);
                        } else {
                          setPhysEndSurah(s.id);
                          setPhysEndAyah(s.verses_count);
                        }
                        setShowSurahPicker(null);
                        setSurahPickerSearch("");
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.emerald + "18", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.emerald }}>{s.id}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>{s.name_simple}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary }}>{s.verses_count} ayahs</Text>
                      </View>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 16, color: colors.textTertiary }}>{s.name_arabic}</Text>
                    </Pressable>
                  )}
                />
              </View>
            ) : physicalTab === "surahs" ? (
              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>Start</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>Surah</Text>
                    <Pressable
                      style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                      onPress={() => { Keyboard.dismiss(); setShowSurahPicker("start"); }}
                    >
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text }} numberOfLines={1}>
                        {surahs.find(s => s.id === physStartSurah)?.name_simple || `Surah ${physStartSurah}`}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>Ayah</Text>
                    <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                      <TextInput
                        style={{ padding: 12, fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text }}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        blurOnSubmit
                        value={String(physStartAyah)}
                        onChangeText={t => {
                          const n = parseInt(t) || 1;
                          const max = surahs.find(s => s.id === physStartSurah)?.verses_count || 999;
                          setPhysStartAyah(Math.max(1, Math.min(n, max)));
                        }}
                      />
                    </View>
                  </View>
                </View>

                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>End</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>Surah</Text>
                    <Pressable
                      style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                      onPress={() => { Keyboard.dismiss(); setShowSurahPicker("end"); }}
                    >
                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text }} numberOfLines={1}>
                        {surahs.find(s => s.id === physEndSurah)?.name_simple || `Surah ${physEndSurah}`}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>Ayah</Text>
                    <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                      <TextInput
                        style={{ padding: 12, fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text }}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        blurOnSubmit
                        value={String(physEndAyah)}
                        onChangeText={t => {
                          const n = parseInt(t) || 1;
                          const max = surahs.find(s => s.id === physEndSurah)?.verses_count || 999;
                          setPhysEndAyah(Math.max(1, Math.min(n, max)));
                        }}
                      />
                    </View>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>Start Page</Text>
                    <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                      <TextInput
                        style={{ padding: 12, fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text, textAlign: "center" }}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        blurOnSubmit
                        value={String(physStartPage)}
                        onChangeText={t => { const n = parseInt(t) || 1; setPhysStartPage(Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, n))); }}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>End Page</Text>
                    <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                      <TextInput
                        style={{ padding: 12, fontFamily: "Inter_500Medium", fontSize: 14, color: colors.text, textAlign: "center" }}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        blurOnSubmit
                        value={String(physEndPage)}
                        onChangeText={t => { const n = parseInt(t) || 1; setPhysEndPage(Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, n))); }}
                      />
                    </View>
                  </View>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textTertiary, textAlign: "center" }}>
                  Pages 1–{TOTAL_MUSHAF_PAGES} (Medina Mushaf)
                </Text>
              </View>
            )}

            {showSurahPicker === null && (
              <Pressable
                style={{ backgroundColor: colors.emerald, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 }}
                onPress={handlePhysicalSubmit}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Save Reading</Text>
              </Pressable>
            )}
          </GlassModalContainer>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <View style={{ flex: 1 }}>
      {physicalReadingModal}
      <Pressable
        style={[qStyles.searchBar, { marginBottom: 15, backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => { setQSection("search"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        testID="quran-search-bar"
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <Text style={[qStyles.searchPlaceholder, { color: colors.textTertiary }]}>Search verses...</Text>
      </Pressable>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        <Pressable
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: viewMode === "mushaf" ? colors.emerald + "18" : colors.surface, borderRadius: 10, paddingVertical: 9, borderWidth: 1, borderColor: viewMode === "mushaf" ? colors.emerald + "40" : colors.border }}
          onPress={() => {
            toggleViewMode();
            if (viewMode === "verses") {
              setQSection("mushafView");
              fetchMushafPage(mushafPage || 1);
            }
          }}
        >
          <Ionicons name={viewMode === "mushaf" ? "book" : "book-outline"} size={15} color={viewMode === "mushaf" ? colors.emerald : colors.textSecondary} />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: viewMode === "mushaf" ? colors.emerald : colors.textSecondary }}>
            {viewMode === "mushaf" ? "Mushaf View" : "Mushaf View"}
          </Text>
        </Pressable>
        <Pressable
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.gold + "12", borderRadius: 10, paddingVertical: 9, borderWidth: 1, borderColor: colors.gold + "30" }}
          onPress={() => setShowPhysicalModal(true)}
        >
          <Ionicons name="add-circle-outline" size={15} color={colors.gold} />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.gold }}>Physical Reading</Text>
        </Pressable>
      </View>

      {viewMode === "mushaf" ? (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 42 }}>
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: colors.text, paddingVertical: 0 }}
                placeholder={`Go to page (1–${TOTAL_MUSHAF_PAGES})`}
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                returnKeyType="go"
                value={mushafPageInput}
                onChangeText={setMushafPageInput}
                onSubmitEditing={() => {
                  const p = parseInt(mushafPageInput);
                  if (p >= 1 && p <= TOTAL_MUSHAF_PAGES) {
                    setQSection("mushafView");
                    fetchMushafPage(p);
                    setMushafPageInput("");
                  }
                }}
              />
            </View>
            <Pressable
              style={{ backgroundColor: colors.emerald, borderRadius: 10, paddingHorizontal: 16, height: 42, alignItems: "center", justifyContent: "center" }}
              onPress={() => {
                const p = parseInt(mushafPageInput);
                if (p >= 1 && p <= TOTAL_MUSHAF_PAGES) {
                  setQSection("mushafView");
                  fetchMushafPage(p);
                  setMushafPageInput("");
                }
              }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>Go</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, textAlign: "center" }}>Juz Pages</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {(() => {
                const juzPages = [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,483,502,522,542,562,582];
                const currentJuz = resumePos?.mushafPage
                  ? juzPages.reduce((juz, start, i) => (resumePos.mushafPage! >= start ? i : juz), 0)
                  : -1;
                return Array.from({ length: 30 }, (_, i) => {
                  const juzPage = juzPages[i];
                  const isCurrent = i === currentJuz;
                  return (
                    <Pressable
                      key={i}
                      style={({ pressed }) => ({
                        width: "18.5%" as any,
                        backgroundColor: pressed ? colors.emerald + "30" : isCurrent ? colors.emerald + "12" : colors.surface,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isCurrent ? colors.emerald + "50" : colors.border,
                        paddingVertical: 10,
                        alignItems: "center" as const,
                      })}
                      onPress={() => {
                        setQSection("mushafView");
                        fetchMushafPage(juzPage);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {isCurrent && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.emerald }} />}
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: isCurrent ? colors.emerald : colors.text }}>Juz {i + 1}</Text>
                      </View>
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: isCurrent ? colors.emerald : colors.textTertiary, marginTop: 2 }}>p. {juzPage}</Text>
                    </Pressable>
                  );
                });
              })()}
            </View>
          </ScrollView>
        </View>
      ) : surahsLoading ? (
        <ActivityIndicator size="small" color={colors.emerald} style={{ marginTop: 24 }} />
      ) : errorMsg && surahs.length === 0 ? (
        <View style={qStyles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textSecondary} />
          <Text style={[qStyles.emptyText, { color: colors.textSecondary }]}>{errorMsg}</Text>
          <Pressable
            style={[qStyles.retryBtn, { backgroundColor: colors.emerald }]}
            onPress={fetchSurahs}
          >
            <Text style={qStyles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={surahs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderSurahItem}
          ListHeaderComponent={surahListHeader}
          contentContainerStyle={{ paddingBottom: 40 }}
          scrollEnabled={surahs.length > 0}
          testID="surah-list"
        />
      )}
    </View>
  );
});

const qStyles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  backLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  verseViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleArea: {
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
  },
  collapsedBanner: {
    flex: 1,
    justifyContent: "center" as const,
  },
  collapsedAccent: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  collapsedArabic: {
    fontSize: 14,
    fontFamily: Platform.OS === "web" ? "serif" : undefined,
  },
  collapsedName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  collapsedSep: {
    fontSize: 12,
  },
  dropdownToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  surahItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  surahNumber: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  surahNumberText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  surahDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  surahName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  surahMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  surahArabic: {
    fontSize: 20,
    fontFamily: Platform.OS === "web" ? "serif" : undefined,
    textAlign: "right" as const,
  },
  bannerAnimWrap: {
    overflow: "hidden" as const,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  surahBannerInner: {
    alignItems: "center" as const,
    padding: 16,
  },
  bannerSurahNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  bannerSurahName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  bannerArabic: {
    fontSize: 32,
    fontFamily: Platform.OS === "web" ? "serif" : undefined,
    marginBottom: 6,
    textAlign: "center" as const,
  },
  bannerEnglish: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center" as const,
  },
  bismillah: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center" as const,
    borderBottomWidth: 1,
  },
  bismillahArabic: {
    fontSize: 20,
    fontFamily: Platform.OS === "web" ? "serif" : undefined,
    marginBottom: 6,
    textAlign: "center" as const,
    lineHeight: 36,
  },
  bismillahEnglish: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
  },
  dropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden" as const,
    padding: 8,
  },
  dropdownSectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  dropdownDivider: {
    height: 1,
    marginVertical: 6,
    marginHorizontal: 8,
  },
  applyBtn: {
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 6,
    marginHorizontal: 8,
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  activeFiltersRow: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  activeFiltersText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  verseItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  versePageItem: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  verseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  verseNumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  verseNumCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  verseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  verseNumText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  verseKey: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  readDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: "auto" as const,
  },
  arabicText: {
    fontSize: 24,
    lineHeight: 42,
    textAlign: "right" as const,
    fontFamily: Platform.OS === "web" ? "serif" : undefined,
    marginBottom: 12,
  },
  translitText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    fontStyle: "italic" as const,
    lineHeight: 22,
    marginBottom: 8,
  },
  translationBlock: {
    marginBottom: 6,
  },
  translationLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  translationText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  searchResultItem: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  searchSurahName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginLeft: 8,
  },
  searchResultText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  resumeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  resumeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  resumeTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  resumeSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  khatamReset: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "right" as const,
    marginTop: 8,
  },
  surahCompleteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  surahCompleteText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
