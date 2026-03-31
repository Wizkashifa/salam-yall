import SwiftUI
import WidgetKit
import AppIntents

// MARK: - Colors

struct WC {
    static let emerald    = Color(red: 0.106, green: 0.420, blue: 0.290)
    static let deepGreen  = Color(red: 0.059, green: 0.239, blue: 0.169)
    static let richGold   = Color(red: 0.831, green: 0.659, blue: 0.263)
    static let darkBg     = Color(red: 0.039, green: 0.102, blue: 0.071)
    static let lightBg    = Color(red: 0.976, green: 0.957, blue: 0.922)
    static let missed     = Color(red: 0.937, green: 0.267, blue: 0.267)

    static func bg(dark: Bool) -> LinearGradient {
        LinearGradient(
            colors: dark
                ? [Color(red: 0.05, green: 0.13, blue: 0.09), Color(red: 0.08, green: 0.22, blue: 0.15)]
                : [Color(red: 0.08, green: 0.32, blue: 0.22), Color(red: 0.05, green: 0.18, blue: 0.12)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
}

// MARK: - Status

struct StatusInfo {
    let icon: String
    let color: Color

    static func from(_ status: String?, isPast: Bool) -> StatusInfo {
        switch status {
        case "completed":
            return .init(icon: "checkmark.circle.fill", color: WC.emerald)
        case "at_masjid":
            return .init(icon: "building.columns.fill", color: WC.richGold)
        case "made_up":
            return .init(icon: "arrow.counterclockwise.circle.fill", color: WC.emerald.opacity(0.6))
        case "excused":
            return .init(icon: "minus.circle.fill", color: .white.opacity(0.35))
        default:
            return isPast
                ? .init(icon: "circle", color: WC.missed)
                : .init(icon: "circle", color: .white.opacity(0.25))
        }
    }
}

// MARK: - Helpers

private func prayerDate(from s: String) -> Date? {
    let fmt = DateFormatter()
    fmt.dateFormat = "h:mm a"
    fmt.locale = Locale(identifier: "en_US_POSIX")
    guard let p = fmt.date(from: s) else { return nil }
    let cal = Calendar.current
    var c = cal.dateComponents([.year, .month, .day], from: Date())
    let t = cal.dateComponents([.hour, .minute], from: p)
    c.hour = t.hour; c.minute = t.minute
    return cal.date(from: c)
}

private func isPast(_ prayer: Prayer, isNext: Bool = false) -> Bool {
    guard !isNext, let d = prayerDate(from: prayer.athan) else { return false }
    return Date() > d
}

private func countdown(to target: Date) -> String {
    let diff = target.timeIntervalSince(Date())
    guard diff > 0 else { return "" }
    let h = Int(diff) / 3600, m = (Int(diff) % 3600) / 60
    return h > 0 ? "\(h)h \(m)m" : "\(m)m"
}

private func completedCount(_ prayers: [Prayer]) -> Int {
    prayers.filter { $0.status == "completed" || $0.status == "at_masjid" || $0.status == "made_up" }.count
}

// MARK: - Medium Widget (Weather-style)

struct MediumWidgetView: View {
    let entry: PrayerTimesEntry
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        if let data = entry.prayerData {
            VStack(spacing: 0) {
                // Top section: status + countdown (like Weather's location + temp)
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        if let nextIdx = entry.nextPrayerIndex, nextIdx < data.prayers.count {
                            let next = data.prayers[nextIdx]
                            Text("Next Prayer")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.55))
                            Text(next.name)
                                .font(.system(size: 26, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            HStack(spacing: 4) {
                                Text(next.athan)
                                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.8))
                                if let t = prayerDate(from: next.athan) {
                                    let cd = countdown(to: t)
                                    if !cd.isEmpty {
                                        Text("· \(cd)")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(WC.richGold)
                                    }
                                }
                            }
                        } else {
                            Text("All prayers complete")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.55))
                            Text("\(completedCount(data.prayers))/5 prayed")
                                .font(.system(size: 26, weight: .bold, design: .rounded))
                                .foregroundColor(WC.richGold)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 4) {
                        Image(systemName: "moon.stars.fill")
                            .font(.system(size: 16))
                            .foregroundColor(WC.richGold.opacity(0.7))
                        if let h = data.hijriDate, !h.isEmpty {
                            Text(h)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.white.opacity(0.35))
                                .multilineTextAlignment(.trailing)
                                .lineLimit(2)
                        }
                        if let s = data.streak, s > 0 {
                            HStack(spacing: 2) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 9))
                                Text("\(s)d")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .foregroundColor(WC.richGold)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 10)

                // Divider
                Rectangle()
                    .fill(.white.opacity(0.08))
                    .frame(height: 0.5)
                    .padding(.horizontal, 14)

                // Bottom prayer row (like Weather's hourly forecast)
                HStack(spacing: 0) {
                    ForEach(Array(data.prayers.enumerated()), id: \.element.name) { idx, prayer in
                        let isNext = idx == entry.nextPrayerIndex
                        let past = isPast(prayer, isNext: isNext)
                        let info = StatusInfo.from(prayer.status, isPast: past)

                        Button(intent: TogglePrayerIntent(prayerName: prayer.name)) {
                            VStack(spacing: 3) {
                                Text(prayer.name.uppercased())
                                    .font(.system(size: 9, weight: .heavy))
                                    .foregroundColor(isNext ? WC.richGold : .white.opacity(0.5))
                                    .tracking(0.3)

                                Image(systemName: info.icon)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(isNext ? WC.richGold : info.color)
                                    .frame(height: 20)

                                Text(prayer.athan)
                                    .font(.system(size: 11, weight: isNext ? .bold : .medium))
                                    .foregroundColor(isNext ? .white : .white.opacity(0.75))

                                if let iqama = prayer.iqama, !iqama.isEmpty {
                                    Text(iqama)
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(.white.opacity(0.75))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isNext ? .white.opacity(0.1) : .clear)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 0)
                .padding(.top, 0)
                .padding(.bottom, 0)
            }
        } else {
            emptyState
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "moon.stars.fill")
                .font(.system(size: 28)).foregroundColor(WC.richGold)
            Text("Open Salam Y'all to\nload prayer times")
                .font(.system(size: 12)).multilineTextAlignment(.center)
                .foregroundColor(.white.opacity(0.5))
        }
    }
}

// MARK: - Small Widget

struct SmallWidgetView: View {
    let entry: PrayerTimesEntry
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        if let data = entry.prayerData {
            VStack(alignment: .leading, spacing: 0) {
                if let nextIdx = entry.nextPrayerIndex, nextIdx < data.prayers.count {
                    let next = data.prayers[nextIdx]
                    Text("Next Prayer")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                    Text(next.name)
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .padding(.top, 1)
                    Text(next.athan)
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.8))
                        .padding(.top, 1)
                    if let t = prayerDate(from: next.athan) {
                        let cd = countdown(to: t)
                        if !cd.isEmpty {
                            Text(cd)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(WC.richGold)
                                .padding(.top, 2)
                        }
                    }
                } else {
                    Text("All prayers complete")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                    Text("\(completedCount(data.prayers))/5")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(WC.richGold)
                    Text("prayed")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }

                Spacer(minLength: 0)

                // Bottom status row
                HStack(spacing: 0) {
                    ForEach(data.prayers, id: \.name) { prayer in
                        let isNext = entry.nextPrayerIndex.map { data.prayers[$0].name == prayer.name } ?? false
                        let past = isPast(prayer, isNext: isNext)
                        let info = StatusInfo.from(prayer.status, isPast: past && !isNext)
                        VStack(spacing: 2) {
                            Image(systemName: info.icon)
                                .font(.system(size: 12))
                                .foregroundColor(isNext ? WC.richGold : info.color)
                            Text(String(prayer.name.prefix(3)).uppercased())
                                .font(.system(size: 7, weight: .bold))
                                .foregroundColor(isNext ? WC.richGold : .white.opacity(0.4))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(0)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 26)).foregroundColor(WC.richGold)
                Text("Open app to\nload prayers")
                    .font(.system(size: 11)).multilineTextAlignment(.center)
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }
}

// MARK: - Lock Screen: Rectangular

struct RectangularLockScreenView: View {
    let entry: PrayerTimesEntry

    var body: some View {
        if let data = entry.prayerData,
           let nextIdx = entry.nextPrayerIndex,
           nextIdx < data.prayers.count {
            let next = data.prayers[nextIdx]
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "moon.stars.fill")
                        .font(.system(size: 10))
                    Text("Next Prayer")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(next.name)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                    if let t = prayerDate(from: next.athan) {
                        let cd = countdown(to: t)
                        if !cd.isEmpty {
                            Text("in \(cd)")
                                .font(.system(size: 12, weight: .semibold))
                        }
                    }
                }
                Text(next.athan)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else {
            if let data = entry.prayerData {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 11))
                    Text("\(completedCount(data.prayers))/5 prayed")
                        .font(.system(size: 13, weight: .semibold))
                }
            }
        }
    }
}

// MARK: - Lock Screen: Circular

struct CircularLockScreenView: View {
    let entry: PrayerTimesEntry

    var body: some View {
        if let data = entry.prayerData,
           let nextIdx = entry.nextPrayerIndex,
           nextIdx < data.prayers.count {
            let next = data.prayers[nextIdx]
            VStack(spacing: 1) {
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 10))
                Text(String(next.name.prefix(3)).uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .lineLimit(1)
                if let t = prayerDate(from: next.athan) {
                    let diff = t.timeIntervalSince(Date())
                    if diff > 0 {
                        let m = Int(diff) / 60
                        Text(m >= 60 ? "\(m/60)h" : "\(m)m")
                            .font(.system(size: 13, weight: .bold, design: .monospaced))
                    }
                }
            }
        } else {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 22))
        }
    }
}

// MARK: - Lock Screen: Inline

struct InlineLockScreenView: View {
    let entry: PrayerTimesEntry

    var body: some View {
        if let data = entry.prayerData,
           let nextIdx = entry.nextPrayerIndex,
           nextIdx < data.prayers.count {
            let next = data.prayers[nextIdx]
            let timeStr: String = {
                if let t = prayerDate(from: next.athan) {
                    let cd = countdown(to: t)
                    return cd.isEmpty ? next.athan : "in \(cd)"
                }
                return next.athan
            }()
            Label("\(next.name) · \(timeStr)", systemImage: "moon.stars.fill")
        } else {
            Label("\(completedCount(entry.prayerData?.prayers ?? []))/5 prayed", systemImage: "moon.stars.fill")
        }
    }
}
