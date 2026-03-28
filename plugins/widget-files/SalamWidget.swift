import WidgetKit
import SwiftUI

struct PrayerTimelineEntry: TimelineEntry {
    let date: Date
    let data: PrayerWidgetData
}

struct PrayerTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerTimelineEntry {
        PrayerTimelineEntry(date: Date(), data: SharedPrayerDataStore.placeholder())
    }

    func getSnapshot(in context: Context, completion: @escaping (PrayerTimelineEntry) -> Void) {
        let data = SharedPrayerDataStore.loadData() ?? SharedPrayerDataStore.placeholder()
        completion(PrayerTimelineEntry(date: Date(), data: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerTimelineEntry>) -> Void) {
        let now = Date()
        let data = SharedPrayerDataStore.loadData() ?? SharedPrayerDataStore.placeholder()

        var entries: [PrayerTimelineEntry] = []
        entries.append(PrayerTimelineEntry(date: now, data: data))

        for prayer in data.prayers {
            if prayer.time > now {
                entries.append(PrayerTimelineEntry(date: prayer.time, data: data))
            }
        }

        let refreshDate = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now
        let timeline = Timeline(entries: entries, policy: .after(refreshDate))
        completion(timeline)
    }
}

struct SalamWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: PrayerTimelineProvider.Entry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallPrayerWidget(data: entry.data)
        case .systemMedium:
            MediumPrayerWidget(data: entry.data)
        case .systemLarge:
            LargePrayerWidget(data: entry.data)
        case .accessoryCircular:
            LockScreenCircularWidget(data: entry.data)
        case .accessoryRectangular:
            LockScreenRectangularWidget(data: entry.data)
        case .accessoryInline:
            LockScreenInlineWidget(data: entry.data)
        default:
            SmallPrayerWidget(data: entry.data)
        }
    }
}

@main
struct SalamWidget: Widget {
    let kind: String = "SalamPrayerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PrayerTimelineProvider()) { entry in
            SalamWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Prayer Times")
        .description("View prayer times and countdown to the next prayer.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}
