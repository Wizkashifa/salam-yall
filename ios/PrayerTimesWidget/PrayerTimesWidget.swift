import WidgetKit
import SwiftUI

struct PrayerTimesWidget: Widget {
    let kind: String = "PrayerTimesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PrayerTimesProvider()) { entry in
            WidgetContentView(entry: entry)
        }
        .configurationDisplayName("Prayer Times")
        .description("View prayer times and track your daily prayers.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

struct WidgetContentView: View {
    let entry: PrayerTimesEntry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
                .containerBackground(WC.bg(dark: colorScheme == .dark), for: .widget)
        case .systemMedium:
            MediumWidgetView(entry: entry)
                .containerBackground(WC.bg(dark: colorScheme == .dark), for: .widget)
        case .accessoryCircular:
            CircularLockScreenView(entry: entry)
                .containerBackground(.clear, for: .widget)
        case .accessoryRectangular:
            RectangularLockScreenView(entry: entry)
                .containerBackground(.clear, for: .widget)
        case .accessoryInline:
            InlineLockScreenView(entry: entry)
                .containerBackground(.clear, for: .widget)
        default:
            SmallWidgetView(entry: entry)
                .containerBackground(WC.bg(dark: colorScheme == .dark), for: .widget)
        }
    }
}

@main
struct PrayerTimesWidgetBundle: WidgetBundle {
    var body: some Widget { PrayerTimesWidget() }
}
