import SwiftUI
import WidgetKit
import AppIntents

struct WidgetColors {
    static let emerald = Color(red: 0.106, green: 0.420, blue: 0.290)
    static let deepGreen = Color(red: 0.059, green: 0.239, blue: 0.169)
    static let richGold = Color(red: 0.831, green: 0.659, blue: 0.263)
    static let darkBg = Color(red: 0.039, green: 0.102, blue: 0.071)
    static let lightBg = Color(red: 0.976, green: 0.957, blue: 0.922)
}

struct StatusIcon {
    static func icon(for status: String?) -> (name: String, color: Color) {
        switch status {
        case "completed":  return ("checkmark.circle.fill", WidgetColors.emerald)
        case "at_masjid":  return ("building.columns.fill", WidgetColors.richGold)
        case "made_up":    return ("arrow.counterclockwise.circle.fill", Color.blue)
        case "excused":    return ("minus.circle.fill", Color.gray)
        case "missed":     return ("xmark.circle.fill", Color.red)
        default:           return ("circle", Color.gray.opacity(0.4))
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
    let diff = target.timeIntervalSince(Date())
    if diff <= 0 { return "" }
    let hours = Int(diff) / 3600
    let minutes = (Int(diff) % 3600) / 60
    return hours > 0 ? "in \(hours)h \(minutes)m" : "in \(minutes)m"
}

struct SmallWidgetView: View {
    let entry: PrayerTimesEntry
    @Environment(\.colorScheme) var colorScheme

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
                        Image(systemName: "moon.stars.fill").font(.system(size: 12)).foregroundColor(WidgetColors.richGold)
                        Text("Salam Y'all").font(.system(size: 11, weight: .semibold)).foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.5))
                        Spacer()
                    }
                    if let nextIdx = entry.nextPrayerIndex, nextIdx < data.prayers.count {
                        let next = data.prayers[nextIdx]
                        VStack(alignment: .leading, spacing: 2) {
                            Text("NEXT PRAYER").font(.system(size: 9, weight: .bold)).foregroundColor(WidgetColors.richGold).tracking(1)
                            Text(next.name).font(.system(size: 24, weight: .bold, design: .serif)).foregroundColor(isDark ? .white : WidgetColors.deepGreen)
                            Text(next.athan).font(.system(size: 16, weight: .semibold, design: .monospaced)).foregroundColor(WidgetColors.emerald)
                            if let target = prayerDate(from: next.athan) {
                                let cd = countdownText(to: target)
                                if !cd.isEmpty { Text(cd).font(.system(size: 11, weight: .medium)).foregroundColor(WidgetColors.richGold.opacity(0.8)) }
                            }
                            if let iqama = next.iqama, !iqama.isEmpty {
                                Text("Iqama: \(iqama)").font(.system(size: 10, weight: .medium)).foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("ALL PRAYERS").font(.system(size: 9, weight: .bold)).foregroundColor(WidgetColors.richGold).tracking(1)
                            Text("Complete").font(.system(size: 22, weight: .bold, design: .serif)).foregroundColor(WidgetColors.emerald)
                            let completed = data.prayers.filter { $0.status == "completed" || $0.status == "at_masjid" }.count
                            Text("\(completed)/5 tracked").font(.system(size: 11)).foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
                        }
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        ForEach(data.prayers, id: \.name) { prayer in
                            let info = StatusIcon.icon(for: prayer.status)
                            Image(systemName: info.name).font(.system(size: 10)).foregroundColor(info.color)
                        }
                    }
                }
                .padding(14)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "moon.stars.fill").font(.system(size: 28)).foregroundColor(WidgetColors.richGold)
                    Text("Open app to\nload prayers").font(.system(size: 12)).multilineTextAlignment(.center).foregroundColor(isDark ? .white.opacity(0.6) : .black.opacity(0.5))
                }
            }
        }
    }
}

struct MediumWidgetView: View {
    let entry: PrayerTimesEntry
    @Environment(\.colorScheme) var colorScheme

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
                        Image(systemName: "moon.stars.fill").font(.system(size: 11)).foregroundColor(WidgetColors.richGold)
                        Text("Salam Y'all").font(.system(size: 11, weight: .semibold)).foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.5))
                        Spacer()
                        Text(data.date).font(.system(size: 10)).foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.3))
                    }
                    .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)

                    ForEach(Array(data.prayers.enumerated()), id: \.element.name) { index, prayer in
                        let isNext = index == entry.nextPrayerIndex
                        let info = StatusIcon.icon(for: prayer.status)
                        HStack(spacing: 8) {
                            Button(intent: TogglePrayerIntent(prayerName: prayer.name)) {
                                Image(systemName: info.name).font(.system(size: 16, weight: .medium)).foregroundColor(info.color).frame(width: 22, height: 22)
                            }.buttonStyle(.plain)
                            Text(prayer.name).font(.system(size: 13, weight: isNext ? .bold : .medium, design: .serif))
                                .foregroundColor(isNext ? WidgetColors.richGold : (isDark ? .white : WidgetColors.deepGreen))
                                .frame(width: 60, alignment: .leading)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(prayer.athan).font(.system(size: 12, weight: isNext ? .bold : .regular, design: .monospaced))
                                    .foregroundColor(isNext ? WidgetColors.emerald : (isDark ? .white.opacity(0.8) : .black.opacity(0.7)))
                                if let iqama = prayer.iqama, !iqama.isEmpty {
                                    Text(iqama).font(.system(size: 10)).foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.35))
                                }
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 3)
                        .background(isNext ? (isDark ? WidgetColors.emerald.opacity(0.12) : WidgetColors.emerald.opacity(0.06)) : Color.clear)
                    }
                    Spacer(minLength: 0)
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "moon.stars.fill").font(.system(size: 28)).foregroundColor(WidgetColors.richGold)
                    Text("Open Salam Y'all to load prayer times").font(.system(size: 13)).foregroundColor(isDark ? .white.opacity(0.6) : .black.opacity(0.5))
                }
            }
        }
    }
}
