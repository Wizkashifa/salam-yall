import AppIntents
import WidgetKit
import Foundation

struct TogglePrayerIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Prayer Status"
    static var description = IntentDescription("Toggle the completion status of a prayer")

    @Parameter(title: "Prayer Name")
    var prayerName: String

    init() {}
    init(prayerName: String) { self.prayerName = prayerName }

    /// Check if a prayer's time window has passed (i.e. the next prayer has started, or it's past 2am for Isha)
    private func isPrayerExpired(_ prayer: Prayer, allPrayers: [Prayer]) -> Bool {
        let now = Date()
        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        formatter.locale = Locale(identifier: "en_US_POSIX")

        let prayerOrder = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]
        guard let currentIndex = prayerOrder.firstIndex(of: prayer.name) else { return false }

        // Isha expires at 2am the next day
        if prayer.name == "Isha" {
            var tomorrow2am = calendar.dateComponents([.year, .month, .day], from: now)
            tomorrow2am.day! += 1
            tomorrow2am.hour = 2
            tomorrow2am.minute = 0
            if let cutoff = calendar.date(from: tomorrow2am), now >= cutoff {
                return true
            }
            return false
        }

        // Other prayers expire when the next prayer begins
        let nextIndex = currentIndex + 1
        if nextIndex < prayerOrder.count {
            let nextName = prayerOrder[nextIndex]
            if let nextPrayer = allPrayers.first(where: { $0.name == nextName }),
               let parsed = formatter.date(from: nextPrayer.athan) {
                var components = calendar.dateComponents([.year, .month, .day], from: now)
                let timeComponents = calendar.dateComponents([.hour, .minute], from: parsed)
                components.hour = timeComponents.hour
                components.minute = timeComponents.minute
                if let fullDate = calendar.date(from: components), now >= fullDate {
                    return true
                }
            }
        }

        return false
    }

    func perform() async throws -> some IntentResult {
        let suiteName = "group.app.ummahconnect"
        let dataKey = "prayerData"
        guard let defaults = UserDefaults(suiteName: suiteName) else { return .result() }

        var prayerData: PrayerData?
        if let data = defaults.data(forKey: dataKey) {
            prayerData = try? JSONDecoder().decode(PrayerData.self, from: data)
        } else if let str = defaults.string(forKey: dataKey), let data = str.data(using: .utf8) {
            prayerData = try? JSONDecoder().decode(PrayerData.self, from: data)
        }
        guard var data = prayerData else { return .result() }

        if let index = data.prayers.firstIndex(where: { $0.name == prayerName }) {
            let prayer = data.prayers[index]
            let expired = isPrayerExpired(prayer, allPrayers: data.prayers)

            if expired {
                // Expired: nil → completed → at_masjid → made_up → excused → nil
                switch prayer.status {
                case nil:          data.prayers[index].status = "completed"
                case "completed":  data.prayers[index].status = "at_masjid"
                case "at_masjid":  data.prayers[index].status = "made_up"
                case "made_up":    data.prayers[index].status = "excused"
                case "excused":    data.prayers[index].status = nil
                default:           data.prayers[index].status = nil
                }
            } else {
                // Not expired: nil → completed → at_masjid → excused → nil
                switch prayer.status {
                case nil:          data.prayers[index].status = "completed"
                case "completed":  data.prayers[index].status = "at_masjid"
                case "at_masjid":  data.prayers[index].status = "excused"
                case "excused":    data.prayers[index].status = nil
                default:           data.prayers[index].status = nil
                }
            }
        }

        if let encoded = try? JSONEncoder().encode(data) {
            defaults.set(encoded, forKey: dataKey)
            defaults.synchronize()
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
