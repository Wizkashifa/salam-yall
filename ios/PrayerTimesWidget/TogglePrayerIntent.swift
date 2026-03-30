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
            switch data.prayers[index].status {
            case nil:          data.prayers[index].status = "completed"
            case "completed":  data.prayers[index].status = "at_masjid"
            case "at_masjid":  data.prayers[index].status = nil
            default:           data.prayers[index].status = nil
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
