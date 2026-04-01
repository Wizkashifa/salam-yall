interface MCCIqamaChange {
  month: number;
  day: number;
  fajr: string;
  zuhr: string;
  asr: string;
  isha: string;
}

const MCC_IQAMA_CHANGES_2026: MCCIqamaChange[] = [
  { month: 1, day: 1, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 1, day: 4, fajr: "6:30 AM", zuhr: "12:35 PM", asr: "3:45 PM", isha: "8:00 PM" },
  { month: 1, day: 11, fajr: "6:30 AM", zuhr: "12:35 PM", asr: "3:45 PM", isha: "8:00 PM" },
  { month: 1, day: 18, fajr: "6:30 AM", zuhr: "12:35 PM", asr: "4:00 PM", isha: "8:00 PM" },
  { month: 1, day: 25, fajr: "6:30 AM", zuhr: "12:40 PM", asr: "4:00 PM", isha: "8:00 PM" },

  { month: 2, day: 1, fajr: "6:15 AM", zuhr: "12:40 PM", asr: "4:15 PM", isha: "8:00 PM" },
  { month: 2, day: 8, fajr: "6:15 AM", zuhr: "12:40 PM", asr: "4:15 PM", isha: "8:00 PM" },
  { month: 2, day: 15, fajr: "6:00 AM", zuhr: "12:40 PM", asr: "4:30 PM", isha: "8:00 PM" },
  { month: 2, day: 22, fajr: "5:55 AM", zuhr: "12:35 PM", asr: "4:30 PM", isha: "8:00 PM" },

  { month: 3, day: 1, fajr: "5:45 AM", zuhr: "12:35 PM", asr: "4:45 PM", isha: "8:00 PM" },
  { month: 3, day: 8, fajr: "6:35 AM", zuhr: "1:35 PM", asr: "5:45 PM", isha: "9:00 PM" },
  { month: 3, day: 15, fajr: "6:25 AM", zuhr: "1:35 PM", asr: "5:45 PM", isha: "9:00 PM" },
  { month: 3, day: 22, fajr: "6:15 AM", zuhr: "1:30 PM", asr: "6:00 PM", isha: "9:15 PM" },
  { month: 3, day: 29, fajr: "6:00 AM", zuhr: "1:30 PM", asr: "6:00 PM", isha: "9:15 PM" },

  { month: 4, day: 1,  fajr: "5:30 AM", zuhr: "1:30 PM", asr: "5:45 PM", isha: "9:00 PM" },
  { month: 4, day: 16, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:00 PM", isha: "9:30 PM" },

  { month: 5, day: 1, fajr: "5:30 AM", zuhr: "1:30 PM", asr: "6:15 PM", isha: "9:45 PM" },
  { month: 5, day: 3, fajr: "5:20 AM", zuhr: "1:30 PM", asr: "6:15 PM", isha: "9:45 PM" },
  { month: 5, day: 10, fajr: "5:20 AM", zuhr: "1:30 PM", asr: "6:15 PM", isha: "10:00 PM" },
  { month: 5, day: 17, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:00 PM" },
  { month: 5, day: 24, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:05 PM" },
  { month: 5, day: 31, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:10 PM" },

  { month: 6, day: 1, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:10 PM" },
  { month: 6, day: 7, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:15 PM" },
  { month: 6, day: 14, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:15 PM" },
  { month: 6, day: 21, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:15 PM" },
  { month: 6, day: 28, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:15 PM" },

  { month: 7, day: 1, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:15 PM" },
  { month: 7, day: 5, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:15 PM" },
  { month: 7, day: 12, fajr: "5:15 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:10 PM" },
  { month: 7, day: 19, fajr: "5:30 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:00 PM" },
  { month: 7, day: 26, fajr: "5:30 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:00 PM" },

  { month: 8, day: 1, fajr: "5:30 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "10:00 PM" },
  { month: 8, day: 2, fajr: "5:30 AM", zuhr: "1:30 PM", asr: "6:30 PM", isha: "9:45 PM" },
  { month: 8, day: 9, fajr: "5:45 AM", zuhr: "1:30 PM", asr: "6:15 PM", isha: "9:45 PM" },
  { month: 8, day: 16, fajr: "5:45 AM", zuhr: "1:30 PM", asr: "6:15 PM", isha: "9:30 PM" },
  { month: 8, day: 23, fajr: "6:00 AM", zuhr: "1:30 PM", asr: "6:00 PM", isha: "9:30 PM" },
  { month: 8, day: 30, fajr: "6:00 AM", zuhr: "1:30 PM", asr: "6:00 PM", isha: "9:15 PM" },

  { month: 9, day: 1, fajr: "6:00 AM", zuhr: "1:30 PM", asr: "6:00 PM", isha: "9:15 PM" },
  { month: 9, day: 6, fajr: "6:00 AM", zuhr: "1:30 PM", asr: "5:45 PM", isha: "9:00 PM" },
  { month: 9, day: 13, fajr: "6:00 AM", zuhr: "1:30 PM", asr: "5:45 PM", isha: "9:00 PM" },
  { month: 9, day: 20, fajr: "6:15 AM", zuhr: "1:30 PM", asr: "5:30 PM", isha: "8:45 PM" },
  { month: 9, day: 27, fajr: "6:15 AM", zuhr: "1:30 PM", asr: "5:30 PM", isha: "8:45 PM" },

  { month: 10, day: 1, fajr: "6:15 AM", zuhr: "1:30 PM", asr: "5:30 PM", isha: "8:45 PM" },
  { month: 10, day: 4, fajr: "6:30 AM", zuhr: "1:30 PM", asr: "5:15 PM", isha: "8:30 PM" },
  { month: 10, day: 11, fajr: "6:30 AM", zuhr: "1:30 PM", asr: "5:15 PM", isha: "8:15 PM" },
  { month: 10, day: 18, fajr: "6:30 AM", zuhr: "1:30 PM", asr: "5:00 PM", isha: "8:15 PM" },
  { month: 10, day: 25, fajr: "6:30 AM", zuhr: "1:30 PM", asr: "5:00 PM", isha: "8:00 PM" },

  { month: 11, day: 1, fajr: "6:00 AM", zuhr: "12:30 PM", asr: "3:45 PM", isha: "8:00 PM" },
  { month: 11, day: 8, fajr: "6:00 AM", zuhr: "12:30 PM", asr: "3:45 PM", isha: "8:00 PM" },
  { month: 11, day: 15, fajr: "6:15 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 11, day: 22, fajr: "6:15 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 11, day: 29, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },

  { month: 12, day: 1, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 12, day: 6, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 12, day: 13, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 12, day: 20, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
  { month: 12, day: 27, fajr: "6:30 AM", zuhr: "12:30 PM", asr: "3:30 PM", isha: "8:00 PM" },
];

const DAYS_IN_MONTH_2026 = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MCC_MAGHRIB_TIMES_2026: Record<string, string> = {};

const MAGHRIB_DATA: [number, string[]][] = [
  [1, ["5:03 PM","5:04 PM","5:05 PM","5:06 PM","5:07 PM","5:08 PM","5:09 PM","5:10 PM","5:11 PM","5:11 PM","5:12 PM","5:13 PM","5:14 PM","5:15 PM","5:17 PM","5:18 PM","5:19 PM","5:20 PM","5:21 PM","5:22 PM","5:23 PM","5:24 PM","5:25 PM","5:26 PM","5:27 PM","5:28 PM","5:30 PM","5:31 PM","5:32 PM","5:33 PM","5:34 PM"]],
  [2, ["5:35 PM","5:36 PM","5:37 PM","5:38 PM","5:40 PM","5:41 PM","5:42 PM","5:43 PM","5:44 PM","5:45 PM","5:46 PM","5:47 PM","5:48 PM","5:49 PM","5:50 PM","5:52 PM","5:53 PM","5:54 PM","5:55 PM","5:56 PM","5:57 PM","5:58 PM","5:59 PM","6:00 PM","6:01 PM","6:02 PM","6:03 PM","6:04 PM"]],
  [3, ["6:05 PM","6:06 PM","6:07 PM","6:08 PM","6:09 PM","6:10 PM","6:11 PM","7:12 PM","7:13 PM","7:14 PM","7:15 PM","7:16 PM","7:17 PM","7:18 PM","7:18 PM","7:19 PM","7:20 PM","7:21 PM","7:22 PM","7:23 PM","7:24 PM","7:25 PM","7:26 PM","7:27 PM","7:28 PM","7:29 PM","7:30 PM","7:30 PM","7:31 PM","7:32 PM","7:33 PM"]],
  [4, ["7:34 PM","7:35 PM","7:36 PM","7:37 PM","7:38 PM","7:39 PM","7:40 PM","7:40 PM","7:41 PM","7:42 PM","7:43 PM","7:44 PM","7:45 PM","7:46 PM","7:47 PM","7:48 PM","7:49 PM","7:50 PM","7:51 PM","7:51 PM","7:52 PM","7:53 PM","7:54 PM","7:55 PM","7:56 PM","7:57 PM","7:58 PM","7:59 PM","8:00 PM","8:01 PM"]],
  [5, ["8:02 PM","8:02 PM","8:03 PM","8:04 PM","8:05 PM","8:06 PM","8:07 PM","8:08 PM","8:09 PM","8:10 PM","8:11 PM","8:11 PM","8:12 PM","8:13 PM","8:14 PM","8:15 PM","8:16 PM","8:17 PM","8:17 PM","8:18 PM","8:19 PM","8:20 PM","8:21 PM","8:21 PM","8:22 PM","8:23 PM","8:24 PM","8:24 PM","8:25 PM","8:26 PM","8:27 PM"]],
  [6, ["8:27 PM","8:28 PM","8:29 PM","8:29 PM","8:30 PM","8:30 PM","8:31 PM","8:31 PM","8:32 PM","8:32 PM","8:33 PM","8:33 PM","8:34 PM","8:34 PM","8:35 PM","8:35 PM","8:35 PM","8:35 PM","8:36 PM","8:36 PM","8:36 PM","8:36 PM","8:37 PM","8:37 PM","8:37 PM","8:37 PM","8:37 PM","8:37 PM","8:37 PM","8:37 PM"]],
  [7, ["8:37 PM","8:37 PM","8:36 PM","8:36 PM","8:36 PM","8:36 PM","8:36 PM","8:35 PM","8:35 PM","8:35 PM","8:34 PM","8:34 PM","8:33 PM","8:33 PM","8:32 PM","8:32 PM","8:31 PM","8:31 PM","8:30 PM","8:29 PM","8:29 PM","8:28 PM","8:27 PM","8:26 PM","8:26 PM","8:25 PM","8:24 PM","8:23 PM","8:22 PM","8:21 PM","8:20 PM"]],
  [8, ["8:19 PM","8:18 PM","8:17 PM","8:16 PM","8:15 PM","8:14 PM","8:13 PM","8:12 PM","8:11 PM","8:10 PM","8:08 PM","8:07 PM","8:06 PM","8:05 PM","8:03 PM","8:02 PM","8:01 PM","8:00 PM","7:58 PM","7:57 PM","7:56 PM","7:54 PM","7:53 PM","7:51 PM","7:50 PM","7:49 PM","7:47 PM","7:46 PM","7:44 PM","7:43 PM","7:41 PM"]],
  [9, ["7:40 PM","7:38 PM","7:37 PM","7:35 PM","7:34 PM","7:32 PM","7:31 PM","7:29 PM","7:28 PM","7:26 PM","7:25 PM","7:23 PM","7:22 PM","7:20 PM","7:19 PM","7:17 PM","7:15 PM","7:14 PM","7:12 PM","7:11 PM","7:09 PM","7:08 PM","7:06 PM","7:05 PM","7:03 PM","7:02 PM","7:00 PM","6:58 PM","6:57 PM","6:55 PM"]],
  [10, ["6:54 PM","6:52 PM","6:51 PM","6:49 PM","6:48 PM","6:46 PM","6:45 PM","6:43 PM","6:42 PM","6:41 PM","6:39 PM","6:38 PM","6:36 PM","6:35 PM","6:33 PM","6:32 PM","6:31 PM","6:29 PM","6:28 PM","6:27 PM","6:25 PM","6:24 PM","6:23 PM","6:22 PM","6:20 PM","6:19 PM","6:18 PM","6:17 PM","6:16 PM","6:15 PM","6:13 PM"]],
  [11, ["5:12 PM","5:11 PM","5:10 PM","5:09 PM","5:08 PM","5:07 PM","5:06 PM","5:05 PM","5:05 PM","5:04 PM","5:03 PM","5:02 PM","5:01 PM","5:00 PM","5:00 PM","4:59 PM","4:58 PM","4:58 PM","4:57 PM","4:57 PM","4:56 PM","4:56 PM","4:55 PM","4:55 PM","4:54 PM","4:54 PM","4:54 PM","4:53 PM","4:53 PM","4:53 PM"]],
  [12, ["4:53 PM","4:52 PM","4:52 PM","4:52 PM","4:52 PM","4:52 PM","4:52 PM","4:52 PM","4:52 PM","4:52 PM","4:53 PM","4:53 PM","4:53 PM","4:53 PM","4:54 PM","4:54 PM","4:54 PM","4:55 PM","4:55 PM","4:56 PM","4:56 PM","4:57 PM","4:57 PM","4:58 PM","4:58 PM","4:59 PM","5:00 PM","5:00 PM","5:01 PM","5:02 PM","5:02 PM"]],
];

for (const [month, times] of MAGHRIB_DATA) {
  for (let i = 0; i < times.length; i++) {
    const day = i + 1;
    const key = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    MCC_MAGHRIB_TIMES_2026[key] = times[i];
  }
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeStr;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const totalMin = h * 60 + m + minutes;
  const newH24 = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  const newH12 = newH24 === 0 ? 12 : newH24 > 12 ? newH24 - 12 : newH24;
  const newAmpm = newH24 >= 12 ? "PM" : "AM";
  return `${newH12}:${String(newM).padStart(2, "0")} ${newAmpm}`;
}

export interface MCCDayRecord {
  date: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export function generateMCCSchedule(): MCCDayRecord[] {
  const records: MCCDayRecord[] = [];
  let currentIqama = { fajr: "", zuhr: "", asr: "", isha: "" };

  for (let month = 1; month <= 12; month++) {
    const daysInMonth = DAYS_IN_MONTH_2026[month];
    const changesThisMonth = MCC_IQAMA_CHANGES_2026.filter(c => c.month === month);

    for (let day = 1; day <= daysInMonth; day++) {
      const change = changesThisMonth.find(c => c.day === day);
      if (change) {
        currentIqama = { fajr: change.fajr, zuhr: change.zuhr, asr: change.asr, isha: change.isha };
      }

      if (!currentIqama.fajr) continue;

      const dateKey = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const maghribAdhan = MCC_MAGHRIB_TIMES_2026[dateKey];
      const maghribIqama = maghribAdhan ? addMinutesToTime(maghribAdhan, 3) : "";

      records.push({
        date: dateKey,
        fajr: currentIqama.fajr,
        dhuhr: currentIqama.zuhr,
        asr: currentIqama.asr,
        maghrib: maghribIqama,
        isha: currentIqama.isha,
      });
    }
  }

  return records;
}
