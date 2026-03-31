import WidgetKit
import Foundation

struct PrayerTimesProvider: TimelineProvider {
    private let suiteName = "group.app.ummahconnect"
    private let dataKey = "prayerData"

    func placeholder(in context: Context) -> PrayerTimesEntry {
        PrayerTimesEntry(
            date: Date(),
            prayerData: PrayerData(
                date: "",
                prayers: [
                    Prayer(name: "Fajr",    athan: "5:30 AM", iqama: "6:00 AM", status: "completed"),
                    Prayer(name: "Dhuhr",   athan: "1:00 PM", iqama: "1:30 PM", status: "at_masjid"),
                    Prayer(name: "Asr",     athan: "4:30 PM", iqama: "5:00 PM", status: nil),
                    Prayer(name: "Maghrib", athan: "7:15 PM", iqama: "7:20 PM", status: nil),
                    Prayer(name: "Isha",    athan: "8:45 PM", iqama: "9:15 PM", status: nil)
                ],
                hijriDate: "15 Dhul Hijjah 1446",
                streak: 7
            ),
            nextPrayerIndex: 2
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PrayerTimesEntry) -> Void) {
        completion(buildEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerTimesEntry>) -> Void) {
        let entry = buildEntry()
        let nextRefresh = nextRefreshDate(prayerData: entry.prayerData)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    // Refresh every minute when within 10 min of a prayer, otherwise every 15 min
    private func nextRefreshDate(prayerData: PrayerData?) -> Date {
        let now = Date()
        let soon = now.addingTimeInterval(15 * 60) // default: 15 min

        guard let data = prayerData else { return soon }

        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let calendar = Calendar.current

        for prayer in data.prayers {
            guard let parsed = formatter.date(from: prayer.athan) else { continue }
            var comps = calendar.dateComponents([.year, .month, .day], from: now)
            let tc = calendar.dateComponents([.hour, .minute], from: parsed)
            comps.hour = tc.hour; comps.minute = tc.minute; comps.second = 0
            guard let prayerTime = calendar.date(from: comps) else { continue }

            let diff = prayerTime.timeIntervalSince(now)
            if diff > 0 && diff <= 10 * 60 {
                // Within 10 min of next prayer — refresh every minute
                return now.addingTimeInterval(60)
            }
            if diff > 0 && diff <= 60 * 60 {
                // Within 1 hour — refresh every 5 min
                return now.addingTimeInterval(5 * 60)
            }
        }
        return soon
    }

    private func loadPrayerData() -> PrayerData? {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return nil }
        if let data = defaults.data(forKey: dataKey),
           let parsed = try? JSONDecoder().decode(PrayerData.self, from: data) {
            return parsed
        }
        if let str = defaults.string(forKey: dataKey),
           let data = str.data(using: .utf8),
           let parsed = try? JSONDecoder().decode(PrayerData.self, from: data) {
            return parsed
        }
        return nil
    }

    private func buildEntry() -> PrayerTimesEntry {
        guard let prayerData = loadPrayerData() else {
            return PrayerTimesEntry(date: Date(), prayerData: nil, nextPrayerIndex: nil)
        }
        return PrayerTimesEntry(date: Date(), prayerData: prayerData, nextPrayerIndex: findNextPrayerIndex(prayers: prayerData.prayers))
    }

    private func findNextPrayerIndex(prayers: [Prayer]) -> Int? {
        let now = Date()
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for (index, prayer) in prayers.enumerated() {
            if let prayerTime = formatter.date(from: prayer.athan) {
                var components = calendar.dateComponents([.year, .month, .day], from: now)
                let timeComponents = calendar.dateComponents([.hour, .minute], from: prayerTime)
                components.hour = timeComponents.hour
                components.minute = timeComponents.minute
                if let fullDate = calendar.date(from: components), fullDate > now {
                    return index
                }
            }
        }
        return nil
    }
}
