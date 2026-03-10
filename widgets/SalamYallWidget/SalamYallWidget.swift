import WidgetKit
import SwiftUI

struct PrayerEntry: TimelineEntry {
    let date: Date
    let data: PrayerData
}

struct PrayerTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerEntry {
        PrayerEntry(
            date: Date(),
            data: PrayerCalculation.calculate(
                lat: PrayerCalculation.defaultLat,
                lon: PrayerCalculation.defaultLon
            )
        )
    }
    
    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        let data = PrayerCalculation.calculate(
            lat: PrayerCalculation.defaultLat,
            lon: PrayerCalculation.defaultLon
        )
        completion(PrayerEntry(date: Date(), data: data))
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let now = Date()
        let data = PrayerCalculation.calculate(
            lat: PrayerCalculation.defaultLat,
            lon: PrayerCalculation.defaultLon,
            date: now
        )
        
        var entries: [PrayerEntry] = []
        
        for minuteOffset in stride(from: 0, to: 60, by: 5) {
            let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: now)!
            let entryData = PrayerCalculation.calculate(
                lat: PrayerCalculation.defaultLat,
                lon: PrayerCalculation.defaultLon,
                date: entryDate
            )
            entries.append(PrayerEntry(date: entryDate, data: entryData))
        }
        
        let refreshDate = Calendar.current.date(byAdding: .hour, value: 1, to: now)!
        let timeline = Timeline(entries: entries, policy: .after(refreshDate))
        completion(timeline)
    }
}

struct SalamYallWidgetEntryView: View {
    var entry: PrayerEntry
    @Environment(\.widgetFamily) var family
    
    var body: some View {
        switch family {
        case .systemSmall:
            PrayerWidgetSmallView(data: entry.data)
        default:
            PrayerWidgetView(data: entry.data)
        }
    }
}

struct SalamYallWidget: Widget {
    let kind: String = "SalamYallWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PrayerTimelineProvider()) { entry in
            if #available(iOS 17.0, *) {
                SalamYallWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                SalamYallWidgetEntryView(entry: entry)
            }
        }
        .configurationDisplayName("Salam Y'all")
        .description("Prayer times and countdown")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct SalamYallWidgetBundle: WidgetBundle {
    var body: some Widget {
        SalamYallWidget()
    }
}