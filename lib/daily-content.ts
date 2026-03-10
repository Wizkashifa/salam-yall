interface DailyVerse {
  arabic: string;
  translation: string;
  source: string;
  surah: number;
  ayah: number;
  surahName: string;
  surahNameArabic: string;
}

const dailyVerses: DailyVerse[] = [
  {
    arabic: "ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ",
    translation: "Allah! There is no god ˹worthy of worship˺ except Him, the Ever-Living, All-Sustaining. Neither drowsiness nor sleep overtakes Him.",
    source: "Surah Al-Baqarah 2:255",
    surah: 2, ayah: 255,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا ﴿٥﴾ إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا",
    translation: "So, surely with hardship comes ease. Surely with ˹that˺ hardship comes ˹more˺ ease.",
    source: "Surah Ash-Sharh 94:5-6",
    surah: 94, ayah: 5,
    surahName: "Ash-Sharh",
    surahNameArabic: "الشرح",
  },
  {
    arabic: "وَمَن يَتَوَكَّلْ عَلَى ٱللَّهِ فَهُوَ حَسْبُهُۥٓ",
    translation: "And whoever puts their trust in Allah, then He ˹alone˺ is sufficient for them.",
    source: "Surah At-Talaq 65:3",
    surah: 65, ayah: 3,
    surahName: "At-Talaq",
    surahNameArabic: "الطلاق",
  },
  {
    arabic: "فَٱذْكُرُونِىٓ أَذْكُرْكُمْ وَٱشْكُرُوا۟ لِى وَلَا تَكْفُرُونِ",
    translation: "So remember Me, and I will remember you. And be grateful to Me, and never be ungrateful.",
    source: "Surah Al-Baqarah 2:152",
    surah: 2, ayah: 152,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "وَلَقَدْ يَسَّرْنَا ٱلْقُرْءَانَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ",
    translation: "And We have certainly made the Quran easy to remember. So is there anyone who will be mindful?",
    source: "Surah Al-Qamar 54:17",
    surah: 54, ayah: 17,
    surahName: "Al-Qamar",
    surahNameArabic: "القمر",
  },
  {
    arabic: "لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
    translation: "Allah does not burden any soul beyond its capacity.",
    source: "Surah Al-Baqarah 2:286",
    surah: 2, ayah: 286,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "وَقَالَ رَبُّكُمُ ٱدْعُونِىٓ أَسْتَجِبْ لَكُمْ",
    translation: "Your Lord has proclaimed, \u201CCall upon Me, I will respond to you.\u201D",
    source: "Surah Ghafir 40:60",
    surah: 40, ayah: 60,
    surahName: "Ghafir",
    surahNameArabic: "غافر",
  },
  {
    arabic: "أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ",
    translation: "Surely in the remembrance of Allah do hearts find comfort.",
    source: "Surah Ar-Ra'd 13:28",
    surah: 13, ayah: 28,
    surahName: "Ar-Ra'd",
    surahNameArabic: "الرعد",
  },
  {
    arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ ﴿١﴾ ٱللَّهُ ٱلصَّمَدُ",
    translation: "Say, \"He is Allah—One ˹and Indivisible˺. Allah—the Sustainer ˹needed by all˺.\"",
    source: "Surah Al-Ikhlas 112:1-2",
    surah: 112, ayah: 1,
    surahName: "Al-Ikhlas",
    surahNameArabic: "الإخلاص",
  },
  {
    arabic: "وَوَجَدَكَ ضَآلًّا فَهَدَىٰ",
    translation: "Did He not find you unguided then guided you?",
    source: "Surah Ad-Duha 93:7",
    surah: 93, ayah: 7,
    surahName: "Ad-Duha",
    surahNameArabic: "الضحى",
  },
  {
    arabic: "وَرَحْمَتِى وَسِعَتْ كُلَّ شَىْءٍ",
    translation: "My mercy encompasses everything.",
    source: "Surah Al-A'raf 7:156",
    surah: 7, ayah: 156,
    surahName: "Al-A'raf",
    surahNameArabic: "الأعراف",
  },
  {
    arabic: "إِنَّ ٱللَّهَ مَعَ ٱلصَّـٰبِرِينَ",
    translation: "Surely Allah is with those who are patient.",
    source: "Surah Al-Baqarah 2:153",
    surah: 2, ayah: 153,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "وَأَحْسِنُوٓا۟ ۛ إِنَّ ٱللَّهَ يُحِبُّ ٱلْمُحْسِنِينَ",
    translation: "And do good, for Allah certainly loves the good-doers.",
    source: "Surah Al-Baqarah 2:195",
    surah: 2, ayah: 195,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "وَقُولُوا۟ لِلنَّاسِ حُسْنًا",
    translation: "And speak to people kindly.",
    source: "Surah Al-Baqarah 2:83",
    surah: 2, ayah: 83,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "هُوَ ٱلْأَوَّلُ وَٱلْـَٔاخِرُ وَٱلظَّـٰهِرُ وَٱلْبَاطِنُ ۖ وَهُوَ بِكُلِّ شَىْءٍ عَلِيمٌ",
    translation: "He is the First and the Last, the Most High and Most Near, and He has ˹perfect˺ knowledge of all things.",
    source: "Surah Al-Hadid 57:3",
    surah: 57, ayah: 3,
    surahName: "Al-Hadid",
    surahNameArabic: "الحديد",
  },
  {
    arabic: "وَإِذَا سَأَلَكَ عِبَادِى عَنِّى فَإِنِّى قَرِيبٌ ۖ أُجِيبُ دَعْوَةَ ٱلدَّاعِ إِذَا دَعَانِ",
    translation: "When My servants ask you ˹O Prophet˺ about Me: I am truly near. I respond to one's prayer when they call upon Me.",
    source: "Surah Al-Baqarah 2:186",
    surah: 2, ayah: 186,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "مَنْ عَمِلَ صَـٰلِحًا مِّن ذَكَرٍ أَوْ أُنثَىٰ وَهُوَ مُؤْمِنٌ فَأُو۟لَـٰٓئِكَ يَدْخُلُونَ ٱلْجَنَّةَ",
    translation: "Whoever does good, whether male or female, and is a believer, they will enter Paradise.",
    source: "Surah An-Nisa 4:124",
    surah: 4, ayah: 124,
    surahName: "An-Nisa",
    surahNameArabic: "النساء",
  },
  {
    arabic: "وَعِبَادُ ٱلرَّحْمَـٰنِ ٱلَّذِينَ يَمْشُونَ عَلَى ٱلْأَرْضِ هَوْنًا وَإِذَا خَاطَبَهُمُ ٱلْجَـٰهِلُونَ قَالُوا۟ سَلَـٰمًا",
    translation: "The ˹true˺ servants of the Most Compassionate are those who walk on the earth humbly, and when the foolish address them ˹improperly˺, they only respond with peace.",
    source: "Surah Al-Furqan 25:63",
    surah: 25, ayah: 63,
    surahName: "Al-Furqan",
    surahNameArabic: "الفرقان",
  },
  {
    arabic: "كُلُّ نَفْسٍ ذَآئِقَةُ ٱلْمَوْتِ ۗ وَإِنَّمَا تُوَفَّوْنَ أُجُورَكُمْ يَوْمَ ٱلْقِيَـٰمَةِ",
    translation: "Every soul will taste death. And you will only receive your full reward on the Day of Judgment.",
    source: "Surah Ali 'Imran 3:185",
    surah: 3, ayah: 185,
    surahName: "Ali 'Imran",
    surahNameArabic: "آل عمران",
  },
  {
    arabic: "يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ ۚ إِنَّ ٱللَّهَ مَعَ ٱلصَّـٰبِرِينَ",
    translation: "O believers! Seek comfort in patience and prayer. Allah is truly with those who are patient.",
    source: "Surah Al-Baqarah 2:153",
    surah: 2, ayah: 153,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "إِنَّ ٱللَّهَ وَمَلَـٰٓئِكَتَهُۥ يُصَلُّونَ عَلَى ٱلنَّبِىِّ ۚ يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ صَلُّوا۟ عَلَيْهِ وَسَلِّمُوا۟ تَسْلِيمًا",
    translation: "Indeed, Allah showers His blessings upon the Prophet, and His angels pray for him. O believers! Invoke Allah's blessings upon him, and salute him with worthy greetings of peace.",
    source: "Surah Al-Ahzab 33:56",
    surah: 33, ayah: 56,
    surahName: "Al-Ahzab",
    surahNameArabic: "الأحزاب",
  },
  {
    arabic: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰٓ",
    translation: "And your Lord will ˹certainly˺ give you ˹so much˺ that you will be pleased.",
    source: "Surah Ad-Duha 93:5",
    surah: 93, ayah: 5,
    surahName: "Ad-Duha",
    surahNameArabic: "الضحى",
  },
  {
    arabic: "وَنُنَزِّلُ مِنَ ٱلْقُرْءَانِ مَا هُوَ شِفَآءٌ وَرَحْمَةٌ لِّلْمُؤْمِنِينَ",
    translation: "We send down the Quran as a healing and mercy for the believers.",
    source: "Surah Al-Isra 17:82",
    surah: 17, ayah: 82,
    surahName: "Al-Isra",
    surahNameArabic: "الإسراء",
  },
  {
    arabic: "وَمَآ أَرْسَلْنَـٰكَ إِلَّا رَحْمَةً لِّلْعَـٰلَمِينَ",
    translation: "We have sent you ˹O Prophet˺ only as a mercy for the whole world.",
    source: "Surah Al-Anbya 21:107",
    surah: 21, ayah: 107,
    surahName: "Al-Anbya",
    surahNameArabic: "الأنبياء",
  },
  {
    arabic: "رَبَّنَآ ءَاتِنَا فِى ٱلدُّنْيَا حَسَنَةً وَفِى ٱلْـَٔاخِرَةِ حَسَنَةً وَقِنَا عَذَابَ ٱلنَّارِ",
    translation: "Our Lord! Grant us the good of this world and the Hereafter, and protect us from the torment of the Fire.",
    source: "Surah Al-Baqarah 2:201",
    surah: 2, ayah: 201,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "وَلَا تَيْـَٔسُوا۟ مِن رَّوْحِ ٱللَّهِ ۖ إِنَّهُۥ لَا يَيْـَٔسُ مِن رَّوْحِ ٱللَّهِ إِلَّا ٱلْقَوْمُ ٱلْكَـٰفِرُونَ",
    translation: "And never give up hope of Allah's mercy. Indeed, no one loses hope in Allah's mercy except those with no faith.",
    source: "Surah Yusuf 12:87",
    surah: 12, ayah: 87,
    surahName: "Yusuf",
    surahNameArabic: "يوسف",
  },
  {
    arabic: "إِنَّ ٱللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا۟ مَا بِأَنفُسِهِمْ",
    translation: "Indeed, Allah would never change a people's state ˹of favour˺ until they change their own state ˹of faith˺.",
    source: "Surah Ar-Ra'd 13:11",
    surah: 13, ayah: 11,
    surahName: "Ar-Ra'd",
    surahNameArabic: "الرعد",
  },
  {
    arabic: "وَعَسَىٰٓ أَن تَكْرَهُوا۟ شَيْـًٔا وَهُوَ خَيْرٌ لَّكُمْ",
    translation: "Perhaps you dislike something which is good for you.",
    source: "Surah Al-Baqarah 2:216",
    surah: 2, ayah: 216,
    surahName: "Al-Baqarah",
    surahNameArabic: "البقرة",
  },
  {
    arabic: "فَٱصْبِرْ إِنَّ وَعْدَ ٱللَّهِ حَقٌّ",
    translation: "So be patient, ˹O Prophet,˺ for certainly Allah's promise is true.",
    source: "Surah Ghafir 40:77",
    surah: 40, ayah: 77,
    surahName: "Ghafir",
    surahNameArabic: "غافر",
  },
  {
    arabic: "وَتَعَاوَنُوا۟ عَلَى ٱلْبِرِّ وَٱلتَّقْوَىٰ ۖ وَلَا تَعَاوَنُوا۟ عَلَى ٱلْإِثْمِ وَٱلْعُدْوَٰنِ",
    translation: "Cooperate with one another in goodness and righteousness, and do not cooperate in sin and transgression.",
    source: "Surah Al-Ma'idah 5:2",
    surah: 5, ayah: 2,
    surahName: "Al-Ma'idah",
    surahNameArabic: "المائدة",
  },
];

export type { DailyVerse };

export function getDailyVerse(): DailyVerse {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return dailyVerses[dayOfYear % dailyVerses.length];
}

export function isFriday(): boolean {
  return new Date().getDay() === 5;
}
