interface DailyContent {
  text: string;
  source: string;
  type: 'quran' | 'hadith';
}

const islamicReminders: DailyContent[] = [
  {
    text: "Allah! There is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep.",
    source: "Surah Al-Baqarah 2:255",
    type: "quran",
  },
  {
    text: "In the name of Allah, the Most Gracious, the Most Merciful. All praise is due to Allah, Lord of all the worlds.",
    source: "Surah Al-Fatiha 1:1-2",
    type: "quran",
  },
  {
    text: "Indeed, with hardship comes ease.",
    source: "Surah Ash-Sharh 94:6",
    type: "quran",
  },
  {
    text: "And whoever puts their trust in Allah, then He alone is sufficient for him.",
    source: "Surah At-Talaq 65:3",
    type: "quran",
  },
  {
    text: "So remember Me; I will remember you. And be grateful to Me and do not deny Me.",
    source: "Surah Al-Baqarah 2:152",
    type: "quran",
  },
  {
    text: "And We have certainly made the Quran easy for remembrance, so is there any who will remember?",
    source: "Surah Al-Qamar 54:17",
    type: "quran",
  },
  {
    text: "Allah does not burden a soul beyond that it can bear.",
    source: "Surah Al-Baqarah 2:286",
    type: "quran",
  },
  {
    text: "And your Lord says, 'Call upon Me; I will respond to you.'",
    source: "Surah Ghafir 40:60",
    type: "quran",
  },
  {
    text: "Verily, in the remembrance of Allah do hearts find rest.",
    source: "Surah Ar-Ra'd 13:28",
    type: "quran",
  },
  {
    text: "Say, 'He is Allah, the One. Allah, the Eternal Refuge.'",
    source: "Surah Al-Ikhlas 112:1-2",
    type: "quran",
  },
  {
    text: "And He found you lost and guided you.",
    source: "Surah Ad-Duha 93:7",
    type: "quran",
  },
  {
    text: "My mercy encompasses all things.",
    source: "Surah Al-A'raf 7:156",
    type: "quran",
  },
  {
    text: "Indeed, Allah is with the patient.",
    source: "Surah Al-Baqarah 2:153",
    type: "quran",
  },
  {
    text: "And do good; indeed, Allah loves the doers of good.",
    source: "Surah Al-Baqarah 2:195",
    type: "quran",
  },
  {
    text: "And speak to people good words.",
    source: "Surah Al-Baqarah 2:83",
    type: "quran",
  },
  {
    text: "He is the First and the Last, the Ascendant and the Intimate, and He is, of all things, Knowing.",
    source: "Surah Al-Hadid 57:3",
    type: "quran",
  },
  {
    text: "The best of you are those who are best to their families.",
    source: "Tirmidhi 3895",
    type: "hadith",
  },
  {
    text: "None of you truly believes until he loves for his brother what he loves for himself.",
    source: "Sahih Bukhari 13, Sahih Muslim 45",
    type: "hadith",
  },
  {
    text: "The strong man is not the one who can overpower others. Rather, the strong man is the one who controls himself when he is angry.",
    source: "Sahih Bukhari 6114",
    type: "hadith",
  },
  {
    text: "Smiling in the face of your brother is charity.",
    source: "Tirmidhi 1956",
    type: "hadith",
  },
  {
    text: "Whoever believes in Allah and the Last Day, let him speak good or remain silent.",
    source: "Sahih Bukhari 6018, Sahih Muslim 47",
    type: "hadith",
  },
  {
    text: "The most beloved deed to Allah is the most regular and constant even if it were little.",
    source: "Sahih Bukhari 6464",
    type: "hadith",
  },
  {
    text: "Make things easy and do not make them difficult. Give good news and do not drive people away.",
    source: "Sahih Bukhari 69",
    type: "hadith",
  },
  {
    text: "Allah does not look at your bodies or your forms, but He looks at your hearts and your deeds.",
    source: "Sahih Muslim 2564",
    type: "hadith",
  },
  {
    text: "The best among you are those who learn the Quran and teach it.",
    source: "Sahih Bukhari 5027",
    type: "hadith",
  },
  {
    text: "Take advantage of five before five: your youth before your old age, your health before your illness, your wealth before your poverty, your free time before your work, and your life before your death.",
    source: "Shu'ab al-Iman, Al-Bayhaqi",
    type: "hadith",
  },
  {
    text: "Charity does not decrease wealth.",
    source: "Sahih Muslim 2588",
    type: "hadith",
  },
  {
    text: "The supplication of a fasting person is not rejected.",
    source: "Sunan Ibn Majah 1752",
    type: "hadith",
  },
  {
    text: "Whoever follows a path in pursuit of knowledge, Allah will make easy for him a path to Paradise.",
    source: "Sahih Muslim 2699",
    type: "hadith",
  },
  {
    text: "The best of people are those who are most beneficial to people.",
    source: "Al-Mu'jam al-Awsat, Tabarani",
    type: "hadith",
  },
  {
    text: "Be in this world as if you were a stranger or a traveler.",
    source: "Sahih Bukhari 6416",
    type: "hadith",
  },
  {
    text: "He who is not grateful to people is not grateful to Allah.",
    source: "Sunan Abu Dawud 4811",
    type: "hadith",
  },
  {
    text: "The most complete of the believers in faith are those with the best character.",
    source: "Sunan Abu Dawud 4682",
    type: "hadith",
  },
  {
    text: "Whoever removes a worldly hardship from a believer, Allah will remove one of the hardships of the Day of Resurrection from him.",
    source: "Sahih Muslim 2699",
    type: "hadith",
  },
  {
    text: "And those who have believed and whose hearts find rest in the remembrance of Allah. Verily, in the remembrance of Allah do hearts find rest.",
    source: "Surah Ar-Ra'd 13:28",
    type: "quran",
  },
  {
    text: "O you who have believed, seek help through patience and prayer. Indeed, Allah is with the patient.",
    source: "Surah Al-Baqarah 2:153",
    type: "quran",
  },
  {
    text: "When My servants ask you about Me, indeed I am near. I respond to the call of the caller when he calls upon Me.",
    source: "Surah Al-Baqarah 2:186",
    type: "quran",
  },
  {
    text: "Whoever does righteousness, whether male or female, while being a believer — those will enter Paradise.",
    source: "Surah An-Nisa 4:124",
    type: "quran",
  },
  {
    text: "And the servants of the Most Merciful are those who walk upon the earth humbly, and when the ignorant address them, they say words of peace.",
    source: "Surah Al-Furqan 25:63",
    type: "quran",
  },
  {
    text: "Every soul shall taste death. And you will only receive your full reward on the Day of Resurrection.",
    source: "Surah Aal-E-Imran 3:185",
    type: "quran",
  },
];

export function getDailyContent(): DailyContent {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return islamicReminders[dayOfYear % islamicReminders.length];
}

export interface JumuahInfo {
  masjid: string;
  khutbah: string;
  iqama: string;
}

const jumuahSchedules: JumuahInfo[] = [
  { masjid: "IAR (Atwater)", khutbah: "1:00 PM", iqama: "1:30 PM" },
  { masjid: "IAR (Page Rd)", khutbah: "1:00 PM", iqama: "1:30 PM" },
  { masjid: "Islamic Center of Morrisville", khutbah: "12:30 PM", iqama: "1:00 PM" },
  { masjid: "Islamic Center of Cary", khutbah: "1:00 PM", iqama: "1:30 PM" },
  { masjid: "As-Salaam Islamic Center", khutbah: "1:15 PM", iqama: "1:45 PM" },
  { masjid: "Chapel Hill Islamic Society", khutbah: "1:00 PM", iqama: "1:30 PM" },
  { masjid: "Ar-Razzaq Islamic Center", khutbah: "1:15 PM", iqama: "1:45 PM" },
  { masjid: "JIAR (Fayetteville St)", khutbah: "1:00 PM", iqama: "1:30 PM" },
  { masjid: "JIAR Parkwood (3 shifts)", khutbah: "12:10 PM", iqama: "1:10 / 2:10 PM" },
];

export function isFriday(): boolean {
  return new Date().getDay() === 5;
}

export function getJumuahSchedules(): JumuahInfo[] {
  return jumuahSchedules;
}
