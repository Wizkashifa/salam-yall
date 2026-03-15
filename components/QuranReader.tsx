import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  logQuranRead,
  markSurahRead,
  getKhatamProgress,
  resetKhatam,
  saveReadingPosition,
  getReadingPosition,
  saveSurahProgress,
  getSurahProgress,
  type KhatamProgress,
  type ReadingPosition,
} from "@/lib/quran-tracker";

const VERSES_PER_PAGE = 50;
const API_BASE = "https://api.quran.com/api/v4";
const BANNER_COLLAPSE_THRESHOLD = 30;

const TRANSLATIONS: { id: number; label: string }[] = [
  { id: 20, label: "Sahih International" },
  { id: 131, label: "Dr. Mustafa Khattab" },
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
  transliteration?: { text?: string };
}

interface ApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  words?: ApiWord[];
  translations?: Array<{ resource_id?: number; text?: string }>;
}

interface ApiSearchResult {
  verse_key: string;
  text?: string;
}

type QuranSection = "surahList" | "verseView" | "search";

interface QuranReaderProps {
  colors: ThemeColors;
  onBack: () => void;
}

export function QuranReader({ colors, onBack }: QuranReaderProps) {
  const isDark = useColorScheme() === "dark";
  const [qSection, setQSection] = useState<QuranSection>("surahList");
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [surahsLoading, setSurahsLoading] = useState(true);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [versesLoading, setVersesLoading] = useState(false);
  const [versesPage, setVersesPage] = useState(1);
  const [versesHasMore, setVersesHasMore] = useState(false);
  const [selectedTranslationIds, setSelectedTranslationIds] = useState<number[]>([20]);
  const [showTransliteration, setShowTransliteration] = useState(true);
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

  const versesListRef = useRef<FlatList>(null);
  const fetchIdRef = useRef(0);
  const readUpToRef = useRef(-1);
  const surahMarkedRef = useRef(false);
  const selectedSurahRef = useRef<Surah | null>(null);
  const lastVisibleVerseRef = useRef<{ key: string; number: number } | null>(null);
  const bannerAnim = useRef(new Animated.Value(1)).current;
  const bannerCollapsedRef = useRef(false);

  useEffect(() => {
    selectedSurahRef.current = selectedSurah;
  }, [selectedSurah]);

  useEffect(() => {
    logQuranRead();
    getKhatamProgress().then(setKhatam).catch(() => {});
    getReadingPosition().then(setResumePos).catch(() => {});
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
      const fields = "text_uthmani";
      const translationParam = transIds.join(",");

      const [translitRes, translitMapRes] = await Promise.all([
        fetch(`${API_BASE}/verses/by_chapter/${surahId}?language=en&fields=${fields}&translation_fields=text,resource_id&translations=${translationParam}&per_page=${VERSES_PER_PAGE}&page=${page}`),
        fetch(`${API_BASE}/verses/by_chapter/${surahId}?language=en&per_page=${VERSES_PER_PAGE}&page=${page}&word_fields=transliteration&words=true`),
      ]);

      if (thisId !== fetchIdRef.current) return;
      if (!translitRes.ok) throw new Error("Failed to load verses");
      const translitData = await translitRes.json();

      const translitMap: Record<string, string> = {};
      if (translitMapRes.ok) {
        const translitMapData = await translitMapRes.json();
        if (translitMapData.verses) {
          for (const v of translitMapData.verses) {
            const words = v.words || [];
            const translit = words.map((w: ApiWord) => w.transliteration?.text || "").filter(Boolean).join(" ");
            translitMap[v.verse_key] = translit;
          }
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
    const surah = surahs.find(s => s.id === resumePos.surahId);
    if (surah) {
      handleSelectSurah(surah, resumePos.page, resumePos.verseKey);
    }
  }, [resumePos, surahs, handleSelectSurah]);

  const handleToggleTranslation = useCallback((id: number) => {
    setSelectedTranslationIds(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
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

  const handleBackFromVerses = useCallback(() => {
    try {
      saveCurrentPosition();
    } catch {}
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

  const renderVerseItem = useCallback(({ item, index }: { item: Verse; index: number }) => {
    const isHighlighted = scrollToVerse === item.verse_key;
    const isRead = index <= readUpToIndex;
    const isCurrent = !isRead && index === readUpToIndex + 1;
    const dotColor = isRead ? colors.emerald : isCurrent ? colors.gold : "transparent";
    return (
      <View
        style={[
          qStyles.verseItem,
          {
            backgroundColor: isHighlighted ? colors.emerald + "15" : colors.surface,
            borderColor: colors.border,
          },
        ]}
        testID={`verse-${item.verse_key}`}
      >
        <View style={qStyles.verseHeader}>
          <View style={[qStyles.verseNumBadge, { backgroundColor: colors.prayerIconBg }]}>
            <Text style={[qStyles.verseNumText, { color: colors.emerald }]}>{item.verse_number}</Text>
          </View>
          {(isRead || isCurrent) && (
            <View style={[qStyles.readDot, { backgroundColor: dotColor }]} />
          )}
        </View>
        <Text style={[qStyles.arabicText, { color: colors.text, marginBottom: showTransliteration && item.transliteration ? 6 : 12 }]}>{item.text_uthmani}</Text>
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
    );
  }, [colors, showTransliteration, scrollToVerse, readUpToIndex]);

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
              {resumePos.surahName} · Ayah {resumePos.verseNumber} of {resumePos.totalVerses}
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
            {selectedTranslationLabels.join(", ")}{showTransliteration ? " + Transliteration" : ""}
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

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        style={[qStyles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => { setQSection("search"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        testID="quran-search-bar"
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <Text style={[qStyles.searchPlaceholder, { color: colors.textTertiary }]}>Search verses...</Text>
      </Pressable>

      {surahsLoading ? (
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
}

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
  bannerArabic: {
    fontSize: 28,
    fontFamily: Platform.OS === "web" ? "serif" : undefined,
    marginBottom: 6,
  },
  bannerEnglish: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
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
