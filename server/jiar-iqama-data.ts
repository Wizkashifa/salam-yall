interface IqamaRange {
  startDay: number;
  endDay: number;
  fajr: string;
  dhuhr: string;
  asrFV: string;
  asrPK: string;
  isha: string;
}

interface MaghribSegment {
  startDay: number;
  endDay: number;
  startMin: number;
  endMin: number;
}

interface MonthConfig {
  month: number;
  daysInMonth: number;
  maghrib: MaghribSegment[];
  ranges: IqamaRange[];
}

const MONTHS_2026: MonthConfig[] = [
  {
    month: 3,
    daysInMonth: 31,
    maghrib: [
      { startDay: 1, endDay: 7, startMin: 1091, endMin: 1096 },
      { startDay: 8, endDay: 31, startMin: 1157, endMin: 1177 },
    ],
    ranges: [
      { startDay: 1, endDay: 7, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "4:00 PM", asrPK: "4:30 PM", isha: "7:45 PM" },
      { startDay: 8, endDay: 14, fajr: "6:30 AM", dhuhr: "1:35 PM", asrFV: "5:00 PM", asrPK: "5:30 PM", isha: "8:45 PM" },
      { startDay: 15, endDay: 21, fajr: "6:30 AM", dhuhr: "1:35 PM", asrFV: "5:00 PM", asrPK: "5:30 PM", isha: "9:00 PM" },
      { startDay: 22, endDay: 31, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:00 PM" },
    ],
  },
  {
    month: 4,
    daysInMonth: 30,
    maghrib: [
      { startDay: 1, endDay: 30, startMin: 1178, endMin: 1202 },
    ],
    ranges: [
      { startDay: 1, endDay: 4, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:00 PM" },
      { startDay: 5, endDay: 11, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:15 PM" },
      { startDay: 12, endDay: 24, fajr: "5:45 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:30 PM" },
      { startDay: 25, endDay: 30, fajr: "5:30 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:30 PM" },
    ],
  },
  {
    month: 5,
    daysInMonth: 31,
    maghrib: [
      { startDay: 1, endDay: 31, startMin: 1203, endMin: 1226 },
    ],
    ranges: [
      { startDay: 1, endDay: 2, fajr: "5:30 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:30 PM" },
      { startDay: 3, endDay: 3, fajr: "5:30 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:45 PM" },
      { startDay: 4, endDay: 8, fajr: "5:30 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "9:45 PM" },
      { startDay: 9, endDay: 16, fajr: "5:15 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "9:45 PM" },
      { startDay: 17, endDay: 23, fajr: "5:15 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "10:00 PM" },
      { startDay: 24, endDay: 30, fajr: "5:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "10:00 PM" },
      { startDay: 31, endDay: 31, fajr: "5:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "10:15 PM" },
    ],
  },
  {
    month: 6,
    daysInMonth: 30,
    maghrib: [
      { startDay: 1, endDay: 30, startMin: 1227, endMin: 1236 },
    ],
    ranges: [
      { startDay: 1, endDay: 30, fajr: "5:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "10:15 PM" },
    ],
  },
  {
    month: 7,
    daysInMonth: 31,
    maghrib: [
      { startDay: 1, endDay: 31, startMin: 1236, endMin: 1221 },
    ],
    ranges: [
      { startDay: 1, endDay: 11, fajr: "5:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "10:15 PM" },
      { startDay: 12, endDay: 18, fajr: "5:15 AM", dhuhr: "1:35 PM", asrFV: "5:45 PM", asrPK: "6:30 PM", isha: "10:15 PM" },
      { startDay: 19, endDay: 25, fajr: "5:15 AM", dhuhr: "1:35 PM", asrFV: "5:45 PM", asrPK: "6:30 PM", isha: "10:00 PM" },
      { startDay: 26, endDay: 31, fajr: "5:30 AM", dhuhr: "1:35 PM", asrFV: "5:45 PM", asrPK: "6:30 PM", isha: "10:00 PM" },
    ],
  },
  {
    month: 8,
    daysInMonth: 31,
    maghrib: [
      { startDay: 1, endDay: 31, startMin: 1220, endMin: 1184 },
    ],
    ranges: [
      { startDay: 1, endDay: 8, fajr: "5:30 AM", dhuhr: "1:35 PM", asrFV: "5:45 PM", asrPK: "6:30 PM", isha: "10:00 PM" },
      { startDay: 9, endDay: 15, fajr: "5:45 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "9:45 PM" },
      { startDay: 16, endDay: 22, fajr: "5:45 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "9:30 PM" },
      { startDay: 23, endDay: 29, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:30 PM", isha: "9:30 PM" },
      { startDay: 30, endDay: 31, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:15 PM" },
    ],
  },
  {
    month: 9,
    daysInMonth: 30,
    maghrib: [
      { startDay: 1, endDay: 30, startMin: 1183, endMin: 1141 },
    ],
    ranges: [
      { startDay: 1, endDay: 5, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:15 PM" },
      { startDay: 6, endDay: 12, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:00 PM" },
      { startDay: 13, endDay: 19, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "9:00 PM" },
      { startDay: 20, endDay: 26, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "5:30 PM", asrPK: "6:00 PM", isha: "8:45 PM" },
      { startDay: 27, endDay: 30, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "5:00 PM", asrPK: "5:45 PM", isha: "8:30 PM" },
    ],
  },
  {
    month: 10,
    daysInMonth: 31,
    maghrib: [
      { startDay: 1, endDay: 31, startMin: 1139, endMin: 1101 },
    ],
    ranges: [
      { startDay: 1, endDay: 3, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "5:00 PM", asrPK: "5:45 PM", isha: "8:30 PM" },
      { startDay: 4, endDay: 10, fajr: "6:30 AM", dhuhr: "1:35 PM", asrFV: "5:00 PM", asrPK: "5:45 PM", isha: "8:30 PM" },
      { startDay: 11, endDay: 18, fajr: "6:30 AM", dhuhr: "1:35 PM", asrFV: "4:30 PM", asrPK: "5:15 PM", isha: "8:15 PM" },
      { startDay: 19, endDay: 31, fajr: "6:30 AM", dhuhr: "1:35 PM", asrFV: "4:30 PM", asrPK: "5:15 PM", isha: "8:00 PM" },
    ],
  },
  {
    month: 11,
    daysInMonth: 30,
    maghrib: [
      { startDay: 1, endDay: 30, startMin: 1040, endMin: 1022 },
    ],
    ranges: [
      { startDay: 1, endDay: 21, fajr: "6:00 AM", dhuhr: "1:35 PM", asrFV: "3:30 PM", asrPK: "4:00 PM", isha: "7:00 PM" },
      { startDay: 22, endDay: 30, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "3:30 PM", asrPK: "4:00 PM", isha: "7:00 PM" },
    ],
  },
  {
    month: 12,
    daysInMonth: 31,
    maghrib: [
      { startDay: 1, endDay: 31, startMin: 1022, endMin: 1032 },
    ],
    ranges: [
      { startDay: 1, endDay: 5, fajr: "6:15 AM", dhuhr: "1:35 PM", asrFV: "3:30 PM", asrPK: "4:00 PM", isha: "7:00 PM" },
      { startDay: 6, endDay: 31, fajr: "6:30 AM", dhuhr: "1:35 PM", asrFV: "3:30 PM", asrPK: "4:00 PM", isha: "7:00 PM" },
    ],
  },
];

function minutesToTime(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const suffix = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function interpolateMaghrib(seg: MaghribSegment, day: number): string {
  const span = seg.endDay - seg.startDay;
  if (span === 0) return minutesToTime(seg.startMin + 10);
  const frac = (day - seg.startDay) / span;
  const adhanMin = seg.startMin + frac * (seg.endMin - seg.startMin);
  return minutesToTime(adhanMin + 10);
}

export interface JIARDayRecord {
  date: string;
  fajr: string;
  dhuhr: string;
  asrFV: string;
  asrPK: string;
  maghrib: string;
  isha: string;
}

export function generateJIARSchedule(): JIARDayRecord[] {
  const records: JIARDayRecord[] = [];

  for (const mc of MONTHS_2026) {
    for (let day = 1; day <= mc.daysInMonth; day++) {
      const dateStr = `2026-${String(mc.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const range = mc.ranges.find(r => day >= r.startDay && day <= r.endDay);
      if (!range) continue;

      const seg = mc.maghrib.find(s => day >= s.startDay && day <= s.endDay);
      if (!seg) continue;

      const maghribIq = interpolateMaghrib(seg, day);

      records.push({
        date: dateStr,
        fajr: range.fajr,
        dhuhr: range.dhuhr,
        asrFV: range.asrFV,
        asrPK: range.asrPK,
        maghrib: maghribIq,
        isha: range.isha,
      });
    }
  }

  return records;
}
