import WidgetKit
import Foundation

struct Prayer: Codable {
    let name: String
    let athan: String
    let iqama: String?
    var status: String?
}

struct PrayerData: Codable {
    let date: String
    var prayers: [Prayer]
    var hijriDate: String?
    var streak: Int?
}

struct PrayerTimesEntry: TimelineEntry {
    let date: Date
    let prayerData: PrayerData?
    let nextPrayerIndex: Int?
}
