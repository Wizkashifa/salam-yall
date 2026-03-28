import SwiftUI
import WidgetKit

struct PrayerColors {
    static let emerald = Color(red: 0.0, green: 0.55, blue: 0.35)
    static let emeraldDark = Color(red: 0.027, green: 0.059, blue: 0.043)
    static let emeraldMid = Color(red: 0.051, green: 0.169, blue: 0.102)
    static let gold = Color(red: 0.85, green: 0.65, blue: 0.2)
    static let goldLight = Color(red: 0.95, green: 0.82, blue: 0.45)
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.7)
}

func prayerIcon(_ name: String) -> String {
    switch name {
    case "fajr": return "sun.horizon.fill"
    case "sunrise": return "sunrise.fill"
    case "dhuhr": return "sun.max.fill"
    case "asr": return "sun.min.fill"
    case "maghrib": return "sunset.fill"
    case "isha": return "moon.stars.fill"
    default: return "clock.fill"
    }
}

func formatTime(_ date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "h:mm a"
    return f.string(from: date)
}

func shortTime(_ date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "h:mm"
    return f.string(from: date)
}

struct SmallPrayerWidget: View {
    let data: PrayerWidgetData

    var body: some View {
        let next = data.nextPrayer
        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [PrayerColors.emeraldDark, PrayerColors.emeraldMid],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "moon.stars.fill")
                        .font(.caption)
                        .foregroundColor(PrayerColors.gold)
                    Text("Salam Y'all")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundColor(PrayerColors.textSecondary)
                    Spacer()
                }

                if let next = next {
                    Spacer()

                    Text("NEXT PRAYER")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(PrayerColors.gold)
                        .tracking(1)

                    HStack(spacing: 6) {
                        Image(systemName: prayerIcon(next.name))
                            .font(.title2)
                            .foregroundColor(PrayerColors.goldLight)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(next.label)
                                .font(.headline)
                                .fontWeight(.bold)
                                .foregroundColor(PrayerColors.textPrimary)
                            Text(formatTime(next.time))
                                .font(.subheadline)
                                .foregroundColor(PrayerColors.textPrimary)
                        }
                    }

                    Spacer()

                    if let iqama = next.iqamaTime {
                        HStack(spacing: 4) {
                            Text("Iqama")
                                .font(.caption2)
                                .foregroundColor(PrayerColors.textSecondary)
                            Text(formatTime(iqama))
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundColor(PrayerColors.gold)
                        }
                    }
                } else {
                    Spacer()
                    Text("Open app to sync")
                        .font(.caption)
                        .foregroundColor(PrayerColors.textSecondary)
                    Spacer()
                }
            }
            .padding(14)
        }
    }
}

struct MediumPrayerWidget: View {
    let data: PrayerWidgetData

    var body: some View {
        let displayPrayers = data.prayers.filter { $0.name != "sunrise" }

        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [PrayerColors.emeraldDark, PrayerColors.emeraldMid],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 8) {
                HStack {
                    Image(systemName: "moon.stars.fill")
                        .font(.caption)
                        .foregroundColor(PrayerColors.gold)
                    Text("Salam Y'all")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundColor(PrayerColors.textSecondary)
                    Spacer()
                    if let loc = data.locationName {
                        Text(loc)
                            .font(.caption2)
                            .foregroundColor(PrayerColors.textSecondary)
                    }
                }

                HStack(spacing: 0) {
                    ForEach(Array(displayPrayers.enumerated()), id: \.offset) { idx, prayer in
                        let isNext = prayer.name == data.nextPrayer?.name
                        VStack(spacing: 4) {
                            Image(systemName: prayerIcon(prayer.name))
                                .font(.system(size: 14))
                                .foregroundColor(isNext ? PrayerColors.goldLight : PrayerColors.textSecondary)

                            Text(prayer.label)
                                .font(.system(size: 10, weight: isNext ? .bold : .medium))
                                .foregroundColor(isNext ? PrayerColors.textPrimary : PrayerColors.textSecondary)

                            Text(shortTime(prayer.time))
                                .font(.system(size: 13, weight: isNext ? .bold : .regular))
                                .foregroundColor(isNext ? PrayerColors.goldLight : PrayerColors.textPrimary)

                            if let iqama = prayer.iqamaTime {
                                Text(shortTime(iqama))
                                    .font(.system(size: 9))
                                    .foregroundColor(PrayerColors.gold.opacity(0.8))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(
                            isNext ?
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(PrayerColors.emerald.opacity(0.3))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .strokeBorder(PrayerColors.gold.opacity(0.4), lineWidth: 1)
                                    )
                            : nil
                        )
                    }
                }

                if let masjid = data.masjidName {
                    HStack {
                        Image(systemName: "building.columns.fill")
                            .font(.system(size: 8))
                            .foregroundColor(PrayerColors.textSecondary)
                        Text(masjid)
                            .font(.system(size: 9))
                            .foregroundColor(PrayerColors.textSecondary)
                        Spacer()
                    }
                }
            }
            .padding(14)
        }
    }
}

struct LargePrayerWidget: View {
    let data: PrayerWidgetData

    var body: some View {
        let allPrayers = data.prayers

        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [PrayerColors.emeraldDark, PrayerColors.emeraldMid, PrayerColors.emeraldDark],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 10) {
                HStack {
                    Image(systemName: "moon.stars.fill")
                        .font(.subheadline)
                        .foregroundColor(PrayerColors.gold)
                    Text("Salam Y'all")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(PrayerColors.textPrimary)
                    Spacer()
                    if let loc = data.locationName {
                        HStack(spacing: 3) {
                            Image(systemName: "location.fill")
                                .font(.system(size: 9))
                            Text(loc)
                                .font(.caption2)
                        }
                        .foregroundColor(PrayerColors.textSecondary)
                    }
                }

                if let next = data.nextPrayer {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("NEXT PRAYER")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(PrayerColors.gold)
                                .tracking(1)
                            HStack(spacing: 8) {
                                Image(systemName: prayerIcon(next.name))
                                    .font(.title3)
                                    .foregroundColor(PrayerColors.goldLight)
                                Text(next.label)
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .foregroundColor(PrayerColors.textPrimary)
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(formatTime(next.time))
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundColor(PrayerColors.goldLight)
                            if let iqama = next.iqamaTime {
                                Text("Iqama \(formatTime(iqama))")
                                    .font(.caption)
                                    .foregroundColor(PrayerColors.gold)
                            }
                        }
                    }
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(PrayerColors.emerald.opacity(0.25))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .strokeBorder(PrayerColors.gold.opacity(0.3), lineWidth: 1)
                            )
                    )
                }

                VStack(spacing: 0) {
                    ForEach(Array(allPrayers.enumerated()), id: \.offset) { idx, prayer in
                        let isNext = prayer.name == data.nextPrayer?.name
                        let isPast = idx < data.nextPrayerIndex

                        HStack {
                            Image(systemName: prayerIcon(prayer.name))
                                .font(.system(size: 13))
                                .foregroundColor(isNext ? PrayerColors.goldLight : (isPast ? PrayerColors.textSecondary.opacity(0.5) : PrayerColors.textSecondary))
                                .frame(width: 20)

                            Text(prayer.label)
                                .font(.system(size: 13, weight: isNext ? .bold : .regular))
                                .foregroundColor(isNext ? PrayerColors.textPrimary : (isPast ? PrayerColors.textSecondary.opacity(0.5) : PrayerColors.textPrimary))

                            Spacer()

                            if let iqama = prayer.iqamaTime {
                                Text(formatTime(iqama))
                                    .font(.system(size: 11))
                                    .foregroundColor(PrayerColors.gold.opacity(isPast ? 0.4 : 0.8))
                                    .frame(width: 65, alignment: .trailing)
                            } else {
                                Spacer()
                                    .frame(width: 65)
                            }

                            Text(formatTime(prayer.time))
                                .font(.system(size: 13, weight: isNext ? .bold : .regular))
                                .foregroundColor(isNext ? PrayerColors.goldLight : (isPast ? PrayerColors.textSecondary.opacity(0.5) : PrayerColors.textPrimary))
                                .frame(width: 70, alignment: .trailing)
                        }
                        .padding(.vertical, 5)
                        .padding(.horizontal, 6)
                        .background(
                            isNext ?
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(PrayerColors.emerald.opacity(0.2))
                            : nil
                        )

                        if idx < allPrayers.count - 1 && !isNext && !(idx + 1 < allPrayers.count && allPrayers[idx + 1].name == data.nextPrayer?.name) {
                            Divider()
                                .background(PrayerColors.textSecondary.opacity(0.15))
                                .padding(.horizontal, 6)
                        }
                    }
                }

                if let masjid = data.masjidName {
                    HStack {
                        Spacer()
                        Image(systemName: "building.columns.fill")
                            .font(.system(size: 8))
                        Text(masjid)
                            .font(.system(size: 9))
                        Spacer()
                    }
                    .foregroundColor(PrayerColors.textSecondary)
                }
            }
            .padding(14)
        }
    }
}
