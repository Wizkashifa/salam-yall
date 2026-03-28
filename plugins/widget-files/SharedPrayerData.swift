import Foundation

struct PrayerTime: Codable {
    let name: String
    let label: String
    let time: Date
    let iqamaTime: Date?
}

struct PrayerWidgetData: Codable {
    let prayers: [PrayerTime]
    let nextPrayerIndex: Int
    let masjidName: String?
    let locationName: String?
    let lastUpdated: Date

    var nextPrayer: PrayerTime? {
        guard nextPrayerIndex >= 0 && nextPrayerIndex < prayers.count else { return nil }
        return prayers[nextPrayerIndex]
    }

    var currentPrayer: PrayerTime? {
        let idx = nextPrayerIndex - 1
        guard idx >= 0 && idx < prayers.count else { return prayers.last }
        return prayers[idx]
    }
}

class SharedPrayerDataStore {
    static let appGroupID = "group.app.ummahconnect"
    static let dataKey = "prayer_widget_data"

    static func loadData() -> PrayerWidgetData? {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let data = defaults.data(forKey: dataKey) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return try? decoder.decode(PrayerWidgetData.self, from: data)
    }

    static func placeholder() -> PrayerWidgetData {
        let now = Date()
        let calendar = Calendar.current
        let prayers = [
            PrayerTime(name: "fajr", label: "Fajr", time: calendar.date(bySettingHour: 5, minute: 30, second: 0, of: now)!, iqamaTime: nil),
            PrayerTime(name: "sunrise", label: "Sunrise", time: calendar.date(bySettingHour: 6, minute: 45, second: 0, of: now)!, iqamaTime: nil),
            PrayerTime(name: "dhuhr", label: "Dhuhr", time: calendar.date(bySettingHour: 12, minute: 30, second: 0, of: now)!, iqamaTime: nil),
            PrayerTime(name: "asr", label: "Asr", time: calendar.date(bySettingHour: 15, minute: 45, second: 0, of: now)!, iqamaTime: nil),
            PrayerTime(name: "maghrib", label: "Maghrib", time: calendar.date(bySettingHour: 18, minute: 30, second: 0, of: now)!, iqamaTime: nil),
            PrayerTime(name: "isha", label: "Isha", time: calendar.date(bySettingHour: 20, minute: 0, second: 0, of: now)!, iqamaTime: nil),
        ]
        return PrayerWidgetData(prayers: prayers, nextPrayerIndex: 2, masjidName: nil, locationName: nil, lastUpdated: now)
    }
}
