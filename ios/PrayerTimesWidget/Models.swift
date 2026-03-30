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
}

struct PrayerTimesEntry: TimelineEntry {
    let date: Date
    let prayerData: PrayerData?
    let nextPrayerIndex: Int?
}
