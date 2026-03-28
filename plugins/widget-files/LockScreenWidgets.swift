import SwiftUI
import WidgetKit

struct LockScreenCircularWidget: View {
    let data: PrayerWidgetData

    var body: some View {
        if let next = data.nextPrayer {
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 1) {
                    Image(systemName: prayerIcon(next.name))
                        .font(.system(size: 14))
                    Text(shortTime(next.time))
                        .font(.system(size: 12, weight: .bold))
                    Text(next.label)
                        .font(.system(size: 8))
                        .textCase(.uppercase)
                }
            }
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "moon.stars.fill")
                    .font(.title3)
            }
        }
    }
}

struct LockScreenRectangularWidget: View {
    let data: PrayerWidgetData

    var body: some View {
        if let next = data.nextPrayer {
            HStack(spacing: 8) {
                Image(systemName: prayerIcon(next.name))
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(next.label)
                        .font(.headline)
                        .fontWeight(.bold)
                    HStack(spacing: 4) {
                        Text(formatTime(next.time))
                            .font(.subheadline)
                        if let iqama = next.iqamaTime {
                            Text("• Iqama \(shortTime(iqama))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                Spacer()
            }
        } else {
            HStack {
                Image(systemName: "moon.stars.fill")
                Text("Salam Y'all")
                    .font(.headline)
                Spacer()
            }
        }
    }
}

struct LockScreenInlineWidget: View {
    let data: PrayerWidgetData

    var body: some View {
        if let next = data.nextPrayer {
            HStack(spacing: 4) {
                Image(systemName: prayerIcon(next.name))
                Text("\(next.label) \(formatTime(next.time))")
            }
        } else {
            Text("Salam Y'all")
        }
    }
}
