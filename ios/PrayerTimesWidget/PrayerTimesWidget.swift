import WidgetKit
import SwiftUI

struct PrayerTimesWidget: Widget {
    let kind: String = "PrayerTimesWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PrayerTimesProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                WidgetContentView(entry: entry).containerBackground(for: .widget) { Color.clear }
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
    @Environment(\.widgetFamily) var family
    var body: some View {
        switch family {
        case .systemSmall: SmallWidgetView(entry: entry)
        case .systemMedium: MediumWidgetView(entry: entry)
        default: SmallWidgetView(entry: entry)
        }
    }
}

@main
struct PrayerTimesWidgetBundle: WidgetBundle {
    var body: some Widget { PrayerTimesWidget() }
}
