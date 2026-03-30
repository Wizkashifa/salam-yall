const APP_GROUP = "group.app.ummahconnect";

function getWidgetSwiftFiles() {
  const models = `import WidgetKit
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
`;

  const provider = `import WidgetKit
import Foundation

struct PrayerTimesProvider: TimelineProvider {
    private let suiteName = "${APP_GROUP}"
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
        let entry = buildEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerTimesEntry>) -> Void) {
        let entry = buildEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadPrayerData() -> PrayerData? {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return nil }

        if let data = defaults.data(forKey: dataKey) {
            if let parsed = try? JSONDecoder().decode(PrayerData.self, from: data) {
                return parsed
            }
        }

        if let str = defaults.string(forKey: dataKey),
           let data = str.data(using: .utf8) {
            if let parsed = try? JSONDecoder().decode(PrayerData.self, from: data) {
                return parsed
            }
        }

        if let dict = defaults.dictionary(forKey: dataKey) {
            return decodePrayerDataFromDict(dict)
        }

        return nil
    }

    private func decodePrayerDataFromDict(_ dict: [String: Any]) -> PrayerData? {
        guard let date = dict["date"] as? String,
              let prayersArray = dict["prayers"] as? [[String: Any]] else {
            return nil
        }

        let prayers: [Prayer] = prayersArray.compactMap { p in
            guard let name = p["name"] as? String,
                  let athan = p["athan"] as? String else { return nil }
            return Prayer(
                name: name,
                athan: athan,
                iqama: p["iqama"] as? String,
                status: p["status"] as? String
            )
        }

        return PrayerData(date: date, prayers: prayers)
    }

    private func buildEntry() -> PrayerTimesEntry {
        guard let prayerData = loadPrayerData() else {
            return PrayerTimesEntry(date: Date(), prayerData: nil, nextPrayerIndex: nil)
        }
        let nextIdx = findNextPrayerIndex(prayers: prayerData.prayers)
        return PrayerTimesEntry(date: Date(), prayerData: prayerData, nextPrayerIndex: nextIdx)
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
`;

  const togglePrayerIntent = `import AppIntents
import WidgetKit
import Foundation

struct TogglePrayerIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Prayer Status"
    static var description = IntentDescription("Toggle the completion status of a prayer")

    @Parameter(title: "Prayer Name")
    var prayerName: String

    init() {}

    init(prayerName: String) {
        self.prayerName = prayerName
    }

    func perform() async throws -> some IntentResult {
        let suiteName = "${APP_GROUP}"
        let dataKey = "prayerData"

        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return .result()
        }

        var prayerData: PrayerData?

        if let data = defaults.data(forKey: dataKey) {
            prayerData = try? JSONDecoder().decode(PrayerData.self, from: data)
        } else if let str = defaults.string(forKey: dataKey),
                  let data = str.data(using: .utf8) {
            prayerData = try? JSONDecoder().decode(PrayerData.self, from: data)
        } else if let dict = defaults.dictionary(forKey: dataKey) {
            prayerData = decodePrayerDataFromDict(dict)
        }

        guard var data = prayerData else {
            return .result()
        }

        if let index = data.prayers.firstIndex(where: { $0.name == prayerName }) {
            let newStatus: String?
            switch data.prayers[index].status {
            case nil:
                newStatus = "completed"
            case "completed":
                newStatus = "at_masjid"
            case "at_masjid":
                newStatus = nil
            default:
                newStatus = nil
            }
            data.prayers[index].status = newStatus
        }

        if let encoded = try? JSONEncoder().encode(data) {
            defaults.set(encoded, forKey: dataKey)
            defaults.synchronize()
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }

    private func decodePrayerDataFromDict(_ dict: [String: Any]) -> PrayerData? {
        guard let date = dict["date"] as? String,
              let prayersArray = dict["prayers"] as? [[String: Any]] else {
            return nil
        }

        let prayers: [Prayer] = prayersArray.compactMap { p in
            guard let name = p["name"] as? String,
                  let athan = p["athan"] as? String else { return nil }
            return Prayer(
                name: name,
                athan: athan,
                iqama: p["iqama"] as? String,
                status: p["status"] as? String
            )
        }

        return PrayerData(date: date, prayers: prayers)
    }
}
`;

  const widgetViews = `import SwiftUI
import WidgetKit
import AppIntents

struct WidgetColors {
    static let emerald = Color(red: 0.106, green: 0.420, blue: 0.290)
    static let deepGreen = Color(red: 0.059, green: 0.239, blue: 0.169)
    static let forestGreen = Color(red: 0.078, green: 0.322, blue: 0.227)
    static let richGold = Color(red: 0.831, green: 0.659, blue: 0.263)
    static let darkGold = Color(red: 0.722, green: 0.573, blue: 0.180)
    static let lightGold = Color(red: 0.941, green: 0.867, blue: 0.627)
    static let darkBg = Color(red: 0.039, green: 0.102, blue: 0.071)
    static let cardBg = Color(red: 0.086, green: 0.086, blue: 0.086).opacity(0.9)
    static let lightBg = Color(red: 0.976, green: 0.957, blue: 0.922)
    static let lightCard = Color.white.opacity(0.85)
}

struct StatusIcon {
    static func icon(for status: String?) -> (name: String, color: Color) {
        switch status {
        case "completed":
            return ("checkmark.circle.fill", WidgetColors.emerald)
        case "at_masjid":
            return ("building.columns.fill", WidgetColors.richGold)
        case "made_up":
            return ("arrow.counterclockwise.circle.fill", Color.blue)
        case "excused":
            return ("minus.circle.fill", Color.gray)
        case "missed":
            return ("xmark.circle.fill", Color.red)
        default:
            return ("circle", Color.gray.opacity(0.4))
        }
    }
}

private func prayerDate(from timeString: String) -> Date? {
    let now = Date()
    let calendar = Calendar.current
    let formatter = DateFormatter()
    formatter.dateFormat = "h:mm a"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    guard let parsed = formatter.date(from: timeString) else { return nil }
    var components = calendar.dateComponents([.year, .month, .day], from: now)
    let timeComponents = calendar.dateComponents([.hour, .minute], from: parsed)
    components.hour = timeComponents.hour
    components.minute = timeComponents.minute
    return calendar.date(from: components)
}

private func countdownText(to target: Date) -> String {
    let now = Date()
    let diff = target.timeIntervalSince(now)
    if diff <= 0 { return "" }
    let hours = Int(diff) / 3600
    let minutes = (Int(diff) % 3600) / 60
    if hours > 0 {
        return "in \\(hours)h \\(minutes)m"
    } else {
        return "in \\(minutes)m"
    }
}

struct SmallWidgetView: View {
    let entry: PrayerTimesEntry

    @Environment(\\.colorScheme) var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        let bgGradient = LinearGradient(
            colors: isDark
                ? [WidgetColors.darkBg, WidgetColors.deepGreen.opacity(0.7)]
                : [WidgetColors.lightBg, WidgetColors.emerald.opacity(0.08)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )

        ZStack {
            bgGradient

            if let data = entry.prayerData {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: "moon.stars.fill")
                            .font(.system(size: 12))
                            .foregroundColor(WidgetColors.richGold)
                        Text("Salam Y'all")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.5))
                        Spacer()
                    }

                    if let nextIdx = entry.nextPrayerIndex, nextIdx < data.prayers.count {
                        let next = data.prayers[nextIdx]
                        VStack(alignment: .leading, spacing: 2) {
                            Text("NEXT PRAYER")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(WidgetColors.richGold)
                                .tracking(1)

                            Text(next.name)
                                .font(.system(size: 24, weight: .bold, design: .serif))
                                .foregroundColor(isDark ? .white : WidgetColors.deepGreen)

                            Text(next.athan)
                                .font(.system(size: 16, weight: .semibold, design: .monospaced))
                                .foregroundColor(WidgetColors.emerald)

                            if let target = prayerDate(from: next.athan) {
                                let countdown = countdownText(to: target)
                                if !countdown.isEmpty {
                                    Text(countdown)
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(WidgetColors.richGold.opacity(0.8))
                                }
                            }

                            if let iqama = next.iqama, !iqama.isEmpty {
                                Text("Iqama: \\(iqama)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("ALL PRAYERS")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(WidgetColors.richGold)
                                .tracking(1)
                            Text("Complete")
                                .font(.system(size: 22, weight: .bold, design: .serif))
                                .foregroundColor(WidgetColors.emerald)

                            let completed = data.prayers.filter {
                                $0.status == "completed" || $0.status == "at_masjid"
                            }.count
                            Text("\\(completed)/5 tracked")
                                .font(.system(size: 11))
                                .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
                        }
                    }

                    Spacer(minLength: 0)

                    HStack(spacing: 4) {
                        ForEach(data.prayers, id: \\.name) { prayer in
                            let info = StatusIcon.icon(for: prayer.status)
                            Image(systemName: info.name)
                                .font(.system(size: 10))
                                .foregroundColor(info.color)
                        }
                    }
                }
                .padding(14)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "moon.stars.fill")
                        .font(.system(size: 28))
                        .foregroundColor(WidgetColors.richGold)
                    Text("Open app to\\nload prayers")
                        .font(.system(size: 12))
                        .multilineTextAlignment(.center)
                        .foregroundColor(isDark ? .white.opacity(0.6) : .black.opacity(0.5))
                }
            }
        }
    }
}

struct MediumWidgetView: View {
    let entry: PrayerTimesEntry

    @Environment(\\.colorScheme) var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        let bgGradient = LinearGradient(
            colors: isDark
                ? [WidgetColors.darkBg, WidgetColors.deepGreen.opacity(0.7)]
                : [WidgetColors.lightBg, WidgetColors.emerald.opacity(0.08)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )

        ZStack {
            bgGradient

            if let data = entry.prayerData {
                VStack(spacing: 0) {
                    HStack {
                        Image(systemName: "moon.stars.fill")
                            .font(.system(size: 11))
                            .foregroundColor(WidgetColors.richGold)
                        Text("Salam Y'all")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.5))
                        Spacer()
                        Text(data.date)
                            .font(.system(size: 10))
                            .foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.3))
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 10)
                    .padding(.bottom, 6)

                    ForEach(Array(data.prayers.enumerated()), id: \\.element.name) { index, prayer in
                        let isNext = index == entry.nextPrayerIndex
                        let info = StatusIcon.icon(for: prayer.status)

                        HStack(spacing: 8) {
                            Button(intent: TogglePrayerIntent(prayerName: prayer.name)) {
                                Image(systemName: info.name)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(info.color)
                                    .frame(width: 22, height: 22)
                            }
                            .buttonStyle(.plain)

                            Text(prayer.name)
                                .font(.system(size: 13, weight: isNext ? .bold : .medium, design: .serif))
                                .foregroundColor(isNext
                                    ? WidgetColors.richGold
                                    : (isDark ? .white : WidgetColors.deepGreen))
                                .frame(width: 60, alignment: .leading)

                            Spacer()

                            VStack(alignment: .trailing, spacing: 0) {
                                Text(prayer.athan)
                                    .font(.system(size: 12, weight: isNext ? .bold : .regular, design: .monospaced))
                                    .foregroundColor(isNext
                                        ? WidgetColors.emerald
                                        : (isDark ? .white.opacity(0.8) : .black.opacity(0.7)))

                                if let iqama = prayer.iqama, !iqama.isEmpty {
                                    Text(iqama)
                                        .font(.system(size: 10))
                                        .foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.35))
                                }
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 3)
                        .background(
                            isNext
                                ? (isDark
                                    ? WidgetColors.emerald.opacity(0.12)
                                    : WidgetColors.emerald.opacity(0.06))
                                : Color.clear
                        )
                    }

                    Spacer(minLength: 0)
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "moon.stars.fill")
                        .font(.system(size: 28))
                        .foregroundColor(WidgetColors.richGold)
                    Text("Open Salam Y'all to load prayer times")
                        .font(.system(size: 13))
                        .foregroundColor(isDark ? .white.opacity(0.6) : .black.opacity(0.5))
                }
            }
        }
    }
}
`;

  const prayerTimesWidget = `import WidgetKit
import SwiftUI

struct PrayerTimesWidget: Widget {
    let kind: String = "PrayerTimesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PrayerTimesProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                WidgetContentView(entry: entry)
                    .containerBackground(for: .widget) { Color.clear }
            } else {
                WidgetContentView(entry: entry)
            }
        }
        .configurationDisplayName("Prayer Times")
        .description("View prayer times and track your daily prayers.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WidgetContentView: View {
    let entry: PrayerTimesEntry

    @Environment(\\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

@main
struct PrayerTimesWidgetBundle: WidgetBundle {
    var body: some Widget {
        PrayerTimesWidget()
    }
}
`;

  return {
    "Models.swift": models,
    "Provider.swift": provider,
    "TogglePrayerIntent.swift": togglePrayerIntent,
    "WidgetViews.swift": widgetViews,
    "PrayerTimesWidget.swift": prayerTimesWidget,
  };
}

function getWidgetKitHelperFiles() {
  const swiftContent = `import Foundation
import WidgetKit

@objc(WidgetKitHelper)
class WidgetKitHelper: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func reloadAllTimelines() {
    if #available(iOS 14.0, *) {
      DispatchQueue.main.async {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
`;

  const objcBridge = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetKitHelper, NSObject)

RCT_EXTERN_METHOD(reloadAllTimelines)

@end
`;

  const bridgingHeader = `#import <React/RCTBridgeModule.h>
`;

  return { swiftContent, objcBridge, bridgingHeader };
}

function getWidgetEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>
`;
}

function getWidgetInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>Prayer Times</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>
`;
}

module.exports = {
  getWidgetSwiftFiles,
  getWidgetKitHelperFiles,
  getWidgetEntitlements,
  getWidgetInfoPlist,
};
