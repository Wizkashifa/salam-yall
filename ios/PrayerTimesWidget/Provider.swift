import WidgetKit
import Foundation

struct PrayerTimesProvider: TimelineProvider {
    private let suiteName = "group.app.ummahconnect"
    private let dataKey = "prayerData"

    func placeholder(in context: Context) -> PrayerTimesEntry {
        PrayerTimesEntry(
            date: Date(),
            prayerData: PrayerData(date: "", prayers: [
                Prayer(name: "Fajr", athan: "5:30 AM", iqama: "6:00 AM", status: nil),
                Prayer(name: "Dhuhr", athan: "1:00 PM", iqama: "1:30 PM", status: "completed"),
                Prayer(name: "Asr", athan: "4:30 PM", iqama: "5:00 PM", status: nil),
                Prayer(name: "Maghrib", athan: "7:15 PM", iqama: "7:20 PM", status: nil),
                Prayer(name: "Isha", athan: "8:45 PM", iqama: "9:15 PM", status: nil)
            ]),
            nextPrayerIndex: 2
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PrayerTimesEntry) -> Void) {
        completion(buildEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerTimesEntry>) -> Void) {
        let entry = buildEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
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
