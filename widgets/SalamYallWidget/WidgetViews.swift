import SwiftUI
import WidgetKit

struct SalamWidgetColors {
    let emerald = Color(red: 27/255, green: 107/255, blue: 74/255)
    let gold = Color(red: 212/255, green: 168/255, blue: 67/255)
    let darkBg = Color(red: 12/255, green: 12/255, blue: 12/255)
    let darkSurface = Color(red: 22/255, green: 22/255, blue: 22/255)
    let lightBg = Color(red: 250/255, green: 250/255, blue: 248/255)
    let lightSurface = Color(red: 240/255, green: 240/255, blue: 235/255)
    let ramadanGold = Color(red: 180/255, green: 140/255, blue: 50/255)
    let ramadanDarkBg = Color(red: 18/255, green: 14/255, blue: 8/255)
}

struct PrayerWidgetView: View {
    let data: PrayerData
    @Environment(\.colorScheme) var colorScheme
    
    private var colors: SalamWidgetColors { SalamWidgetColors() }
    private var isDark: Bool { colorScheme == .dark }
    private var refDate: Date { data.referenceDate }
    
    private var accent: Color {
        data.isRamadan ? colors.gold : colors.emerald
    }
    
    var body: some View {
        VStack(spacing: 0) {
            topSection
            Spacer(minLength: 4)
            bottomSection
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    private var topSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                if let next = data.nextPrayer {
                    Text("\(next.name) is in")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))
                    
                    Text(countdownString)
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .foregroundColor(isDark ? .white : .black)
                        .minimumScaleFactor(0.7)
                } else {
                    Text("Prayers complete")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))
                    
                    Text("✓")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(accent)
                }
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 4) {
                if data.isRamadan {
                    HStack(spacing: 4) {
                        Text("☪")
                            .font(.system(size: 14))
                        Text("Ramadan \(data.hijriDay)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(colors.gold)
                    }
                } else {
                    Image(systemName: "moon.stars.fill")
                        .font(.system(size: 16))
                        .foregroundColor(accent.opacity(0.6))
                }
                
                if let next = data.nextPrayer {
                    Text(next.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(accent)
                }
            }
        }
    }
    
    private var bottomSection: some View {
        HStack(spacing: 0) {
            ForEach(data.prayers, id: \.name) { prayer in
                let isNext = data.nextPrayer?.name == prayer.name
                let isPast = prayer.time <= refDate && !isNext
                
                VStack(spacing: 3) {
                    Text(prayer.shortName)
                        .font(.system(size: 9, weight: isNext ? .bold : .medium))
                        .foregroundColor(
                            isNext ? accent :
                            isPast ? (isDark ? .white.opacity(0.3) : .black.opacity(0.3)) :
                            (isDark ? .white.opacity(0.6) : .black.opacity(0.55))
                        )
                    
                    Text(formatTime(prayer.time))
                        .font(.system(size: 12, weight: isNext ? .bold : .regular, design: .rounded))
                        .foregroundColor(
                            isNext ? accent :
                            isPast ? (isDark ? .white.opacity(0.3) : .black.opacity(0.3)) :
                            (isDark ? .white.opacity(0.8) : .black.opacity(0.75))
                        )
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        )
    }
    
    private var countdownString: String {
        let h = data.countdown.hours
        let m = data.countdown.minutes
        if h > 0 {
            return "\(h):\(String(format: "%02d", m))"
        }
        return "0:\(String(format: "%02d", m))"
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm"
        return formatter.string(from: date)
    }
}

struct PrayerWidgetSmallView: View {
    let data: PrayerData
    @Environment(\.colorScheme) var colorScheme
    
    private var colors: SalamWidgetColors { SalamWidgetColors() }
    private var isDark: Bool { colorScheme == .dark }
    private var refDate: Date { data.referenceDate }
    private var accent: Color {
        data.isRamadan ? colors.gold : colors.emerald
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if data.isRamadan {
                HStack(spacing: 3) {
                    Text("☪")
                        .font(.system(size: 10))
                    Text("Ramadan \(data.hijriDay)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(colors.gold)
                }
            }
            
            if let next = data.nextPrayer {
                Text(next.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))
                
                Text(countdownString)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(isDark ? .white : .black)
                    .minimumScaleFactor(0.6)
            }
            
            Spacer()
            
            nextThreePrayers
        }
        .padding(14)
    }
    
    private var nextThreePrayers: some View {
        let remaining = data.prayers.filter { $0.time > refDate }
        let show = Array(remaining.prefix(3))
        return VStack(alignment: .leading, spacing: 2) {
            ForEach(show, id: \.name) { prayer in
                HStack {
                    Text(prayer.shortName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(accent)
                        .frame(width: 36, alignment: .leading)
                    Text(formatTime(prayer.time))
                        .font(.system(size: 10, weight: .regular, design: .rounded))
                        .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))
                }
            }
        }
    }
    
    private var countdownString: String {
        let h = data.countdown.hours
        let m = data.countdown.minutes
        if h > 0 {
            return "\(h):\(String(format: "%02d", m))"
        }
        return "0:\(String(format: "%02d", m))"
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm"
        return formatter.string(from: date)
    }
}