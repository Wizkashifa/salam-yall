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
                ? [darkBg, deepGreen.opacity(0.75)]
                : [lightBg, emerald.opacity(0.09)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
}

// MARK: - Status

struct StatusInfo {
    let icon: String
    let color: Color
    let nameTint: Color
    let timeTint: Color
    let pillBg: Color

    static func from(_ status: String?, isPast: Bool, isDark: Bool) -> StatusInfo {
        switch status {
        case "completed":
            return .init(icon: "checkmark.circle.fill",
                         color: WC.emerald, nameTint: WC.emerald, timeTint: WC.emerald,
                         pillBg: WC.emerald.opacity(isDark ? 0.18 : 0.08))
        case "at_masjid":
            return .init(icon: "building.columns.fill",
                         color: WC.richGold, nameTint: WC.richGold, timeTint: WC.richGold,
                         pillBg: WC.richGold.opacity(isDark ? 0.15 : 0.10))
        case "made_up":
            return .init(icon: "arrow.counterclockwise.circle.fill",
                         color: WC.emerald.opacity(0.55), nameTint: WC.emerald.opacity(0.55), timeTint: WC.emerald.opacity(0.55),
                         pillBg: WC.emerald.opacity(isDark ? 0.08 : 0.05))
        case "excused":
            return .init(icon: "minus.circle.fill",
                         color: .gray, nameTint: .gray, timeTint: .gray,
                         pillBg: Color.gray.opacity(isDark ? 0.12 : 0.08))
        default:
            if isPast {
                return .init(icon: "circle",
                             color: WC.missed, nameTint: WC.missed, timeTint: WC.missed,
                             pillBg: WC.missed.opacity(isDark ? 0.18 : 0.09))
            } else {
                return .init(icon: "circle",
                             color: Color.gray.opacity(0.35),
                             nameTint: isDark ? .white.opacity(0.45) : .black.opacity(0.45),
                             timeTint: isDark ? .white.opacity(0.85) : .black.opacity(0.80),
                             pillBg: .clear)
            }
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
    return h > 0 ? "\(h) hr, \(m) min" : "\(m) min"
}

// MARK: - Medium Widget

struct MediumWidgetView: View {
    let entry: PrayerTimesEntry
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        if let data = entry.prayerData {
            VStack(spacing: 0) {
                headerRow(data: data, isDark: isDark)
                divider(isDark: isDark).padding(.horizontal, 12)
                pillRow(data: data, isDark: isDark)
                    .padding(.horizontal, 10)
                    .padding(.top, 6)
                    .padding(.bottom, 10)
            }
        } else {
            emptyState(isDark: isDark)
        }
    }

    @ViewBuilder
    private func headerRow(data: PrayerData, isDark: Bool) -> some View {
        HStack(alignment: .center) {
            // Countdown
            if let nextIdx = entry.nextPrayerIndex, nextIdx < data.prayers.count {
                let next = data.prayers[nextIdx]
                let curName = nextIdx > 0 ? data.prayers[nextIdx - 1].name : (data.prayers.last?.name ?? "")
                VStack(alignment: .leading, spacing: 1) {
                    Text("Time for \(curName)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.55) : WC.deepGreen.opacity(0.65))
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text(next.name)
                            .font(.system(size: 18, weight: .bold, design: .serif))
                            .foregroundColor(isDark ? .white : WC.deepGreen)
                        if let t = prayerDate(from: next.athan) {
                            let cd = countdown(to: t)
                            if !cd.isEmpty {
                                Text("in \(cd)")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(WC.richGold)
                            }
                        }
                    }
                }
            } else {
                let isha = data.prayers.last
                let ishaInfo = StatusInfo.from(isha?.status, isPast: true, isDark: isDark)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Isha")
                        .font(.system(size: 18, weight: .bold, design: .serif))
                        .foregroundColor(isDark ? .white : WC.deepGreen)
                    HStack(spacing: 5) {
                        Image(systemName: ishaInfo.icon).font(.system(size: 11)).foregroundColor(ishaInfo.color)
                        Text(isha?.athan ?? "")
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundColor(isDark ? .white.opacity(0.55) : WC.deepGreen.opacity(0.65))
                    }
                }
            }

            Spacer()

            // Right side: hijri date + streak
            VStack(alignment: .trailing, spacing: 2) {
                if let h = data.hijriDate, !h.isEmpty {
                    Text(h)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.35))
                        .multilineTextAlignment(.trailing)
                }
                if let s = data.streak, s > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 10))
                            .foregroundColor(WC.richGold)
                        Text("\(s)d streak")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(WC.richGold)
                    }
                }
            }
        }
        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 8)
    }

    @ViewBuilder
    private func pillRow(data: PrayerData, isDark: Bool) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(data.prayers.enumerated()), id: \.element.name) { idx, prayer in
                let isNext = idx == entry.nextPrayerIndex
                let past = isPast(prayer, isNext: isNext)
                let info = StatusInfo.from(prayer.status, isPast: past, isDark: isDark)

                Button(intent: TogglePrayerIntent(prayerName: prayer.name)) {
                    VStack(spacing: 3) {
                        Image(systemName: info.icon)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(isNext ? WC.richGold : info.color)

                        Text(prayer.name.uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(isNext ? WC.richGold : info.nameTint)
                            .tracking(0.2)

                        Text(prayer.athan)
                            .font(.system(size: 11, weight: isNext ? .bold : .regular, design: .monospaced))
                            .foregroundColor(isNext ? (isDark ? .white : WC.deepGreen) : info.timeTint)

                        if let iqama = prayer.iqama, !iqama.isEmpty {
                            Text(iqama)
                                .font(.system(size: 9))
                                .foregroundColor(isDark ? .white.opacity(0.30) : .black.opacity(0.30))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 9)
                        .fill(isNext
                              ? WC.emerald.opacity(isDark ? 0.15 : 0.07)
                              : info.pillBg))
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func divider(isDark: Bool) -> some View {
        Rectangle()
            .fill(isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.07))
            .frame(height: 0.5)
    }

    @ViewBuilder
    private func emptyState(isDark: Bool) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "moon.stars.fill")
                .font(.system(size: 28)).foregroundColor(WC.richGold)
            Text("Open Salam Y'all to\nload prayer times")
                .font(.system(size: 12)).multilineTextAlignment(.center)
                .foregroundColor(isDark ? .white.opacity(0.55) : .black.opacity(0.45))
        }
    }
}

// MARK: - Small Widget

struct SmallWidgetView: View {
    let entry: PrayerTimesEntry
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        if let data = entry.prayerData {
            VStack(alignment: .leading, spacing: 0) {
                // Countdown block
                Group {
                    if let nextIdx = entry.nextPrayerIndex, nextIdx < data.prayers.count {
                        let next = data.prayers[nextIdx]
                        let curName = nextIdx > 0 ? data.prayers[nextIdx - 1].name : (data.prayers.last?.name ?? "")
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Time for \(curName)")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(isDark ? .white.opacity(0.55) : WC.deepGreen.opacity(0.65))
                            Text(next.name)
                                .font(.system(size: 22, weight: .bold, design: .serif))
                                .foregroundColor(isDark ? .white : WC.deepGreen)
                            if let t = prayerDate(from: next.athan) {
                                let cd = countdown(to: t)
                                if !cd.isEmpty {
                                    Text("in \(cd)")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(WC.richGold)
                                }
                            }
                        }
                    } else {
                        let isha = data.prayers.last
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Isha")
                                .font(.system(size: 22, weight: .bold, design: .serif))
                                .foregroundColor(isDark ? .white : WC.deepGreen)
                            Text(isha?.athan ?? "")
                                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                .foregroundColor(isDark ? .white.opacity(0.55) : WC.deepGreen.opacity(0.65))
                        }
                    }
                }

                Spacer(minLength: 0)

                // Hijri date (if available)
                if let h = data.hijriDate, !h.isEmpty {
                    Text(h)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.35) : .black.opacity(0.30))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.bottom, 4)
                }

                // Status chips
                HStack(spacing: 4) {
                    ForEach(data.prayers, id: \.name) { prayer in
                        let past = isPast(prayer, isNext: false)
                        let isNext = entry.nextPrayerIndex.map { data.prayers[$0].name == prayer.name } ?? false
                        let info = StatusInfo.from(prayer.status, isPast: past && !isNext, isDark: isDark)
                        VStack(spacing: 2) {
                            Image(systemName: info.icon)
                                .font(.system(size: 11))
                                .foregroundColor(isNext ? WC.richGold : info.color)
                            Text(String(prayer.name.prefix(3)))
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(isNext ? WC.richGold : info.nameTint)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(14)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 26)).foregroundColor(WC.richGold)
                Text("Open app to\nload prayers")
                    .font(.system(size: 11)).multilineTextAlignment(.center)
                    .foregroundColor(colorScheme == .dark ? .white.opacity(0.55) : .black.opacity(0.45))
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
            let curName = nextIdx > 0 ? data.prayers[nextIdx - 1].name : (data.prayers.last?.name ?? "")
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "moon.stars.fill")
                        .font(.system(size: 10))
                    Text("Time for \(curName)")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(next.name)
                        .font(.system(size: 16, weight: .bold, design: .serif))
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
            if let isha = entry.prayerData?.prayers.last {
                HStack(spacing: 4) {
                    Image(systemName: StatusInfo.from(isha.status, isPast: true, isDark: false).icon).font(.system(size: 11))
                    Text("Isha · \(isha.athan)").font(.system(size: 13, weight: .semibold))
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
            Label("Isha · \(entry.prayerData?.prayers.last?.athan ?? "")", systemImage: "moon.stars.fill")
        }
    }
}
