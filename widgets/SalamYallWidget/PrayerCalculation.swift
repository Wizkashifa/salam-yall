import Foundation
import CoreLocation

struct PrayerTime {
    let name: String
    let shortName: String
    let time: Date
}

struct PrayerData {
    let prayers: [PrayerTime]
    let nextPrayer: PrayerTime?
    let countdown: (hours: Int, minutes: Int)
    let isRamadan: Bool
    let hijriDay: Int
    let referenceDate: Date
}

class PrayerCalculation {
    
    static let defaultLat = 35.7796
    static let defaultLon = -78.6382
    
    static func calculate(lat: Double, lon: Double, date: Date = Date()) -> PrayerData {
        let cal = Calendar.current
        let prayers = computePrayersForDay(lat: lat, lon: lon, date: date, cal: cal)
        
        var nextPrayer = prayers.first(where: { $0.time > date })
        var countdownH = 0
        var countdownM = 0
        
        if nextPrayer == nil {
            let tomorrow = cal.date(byAdding: .day, value: 1, to: date)!
            let tomorrowPrayers = computePrayersForDay(lat: lat, lon: lon, date: tomorrow, cal: cal)
            nextPrayer = tomorrowPrayers.first
        }
        
        if let next = nextPrayer {
            let diff = max(0, next.time.timeIntervalSince(date))
            countdownH = Int(diff) / 3600
            countdownM = (Int(diff) % 3600) / 60
        }
        
        let islamicCal = Calendar(identifier: .islamicUmmAlQura)
        let hijriMonth = islamicCal.component(.month, from: date)
        let hijriDay = islamicCal.component(.day, from: date)
        let ramadan = hijriMonth == 9
        
        return PrayerData(
            prayers: prayers,
            nextPrayer: nextPrayer,
            countdown: (hours: countdownH, minutes: countdownM),
            isRamadan: ramadan,
            hijriDay: hijriDay,
            referenceDate: date
        )
    }
    
    private static func computePrayersForDay(lat: Double, lon: Double, date: Date, cal: Calendar) -> [PrayerTime] {
        let year = cal.component(.year, from: date)
        let month = cal.component(.month, from: date)
        let day = cal.component(.day, from: date)
        
        let jd = julianDate(year: year, month: month, day: day)
        let sunCoords = solarCoordinates(jd: jd)
        let eqTime = sunCoords.eqOfTime
        let decl = sunCoords.declination
        
        let solarNoon = 12.0 - (lon / 15.0) - (eqTime / 60.0)
        let tzOffset = Double(TimeZone.current.secondsFromGMT(for: date)) / 3600.0
        let solarNoonLocal = solarNoon + tzOffset
        
        let fajrAngle = -15.0
        let ishaAngle = -15.0
        let sunriseAngle = -0.833
        
        let fajrTime = solarNoonLocal - hourAngle(lat: lat, decl: decl, angle: fajrAngle) / 15.0
        let sunriseTime = solarNoonLocal - hourAngle(lat: lat, decl: decl, angle: sunriseAngle) / 15.0
        let dhuhrTime = solarNoonLocal + 1.0 / 60.0
        let asrTime = solarNoonLocal + asrHourAngle(lat: lat, decl: decl) / 15.0
        let maghribTime = solarNoonLocal + hourAngle(lat: lat, decl: decl, angle: sunriseAngle) / 15.0
        let ishaTime = solarNoonLocal + hourAngle(lat: lat, decl: decl, angle: ishaAngle) / 15.0
        
        func toDate(_ hours: Double) -> Date {
            let h = Int(hours)
            let m = Int((hours - Double(h)) * 60)
            return cal.date(bySettingHour: h, minute: m, second: 0, of: date) ?? date
        }
        
        return [
            PrayerTime(name: "Fajr", shortName: "FAJR", time: toDate(fajrTime)),
            PrayerTime(name: "Sunrise", shortName: "RISE", time: toDate(sunriseTime)),
            PrayerTime(name: "Dhuhr", shortName: "DHUHR", time: toDate(dhuhrTime)),
            PrayerTime(name: "Asr", shortName: "ASR", time: toDate(asrTime)),
            PrayerTime(name: "Maghrib", shortName: "MGRB", time: toDate(maghribTime)),
            PrayerTime(name: "Isha", shortName: "ISHA", time: toDate(ishaTime)),
        ]
    }
    
    private static func julianDate(year: Int, month: Int, day: Int) -> Double {
        var y = Double(year)
        var m = Double(month)
        if m <= 2 {
            y -= 1
            m += 12
        }
        let A = floor(y / 100)
        let B = 2 - A + floor(A / 4)
        return floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + Double(day) + B - 1524.5
    }
    
    private static func solarCoordinates(jd: Double) -> (declination: Double, eqOfTime: Double) {
        let T = (jd - 2451545.0) / 36525.0
        let L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)).truncatingRemainder(dividingBy: 360)
        let M = (357.52911 + T * (35999.05029 - 0.0001537 * T)).truncatingRemainder(dividingBy: 360)
        let e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
        
        let Mrad = M * .pi / 180
        let C = (1.914602 - T * (0.004817 + 0.000014 * T)) * sin(Mrad)
            + (0.019993 - 0.000101 * T) * sin(2 * Mrad)
            + 0.000289 * sin(3 * Mrad)
        
        let sunLon = L0 + C
        let omega = 125.04 - 1934.136 * T
        let lambda = sunLon - 0.00569 - 0.00478 * sin(omega * .pi / 180)
        let obliq = 23.439291 - 0.013004167 * T
        let obliqCorr = obliq + 0.00256 * cos(omega * .pi / 180)
        
        let lambdaRad = lambda * .pi / 180
        let obliqRad = obliqCorr * .pi / 180
        let decl = asin(sin(obliqRad) * sin(lambdaRad)) * 180 / .pi
        
        let y2 = tan(obliqRad / 2) * tan(obliqRad / 2)
        let L0rad = L0 * .pi / 180
        let eqTime = 4 * (y2 * sin(2 * L0rad) - 2 * e * sin(Mrad) + 4 * e * y2 * sin(Mrad) * cos(2 * L0rad) - 0.5 * y2 * y2 * sin(4 * L0rad) - 1.25 * e * e * sin(2 * Mrad)) * 180 / .pi
        
        return (declination: decl, eqOfTime: eqTime)
    }
    
    private static func hourAngle(lat: Double, decl: Double, angle: Double) -> Double {
        let latRad = lat * .pi / 180
        let declRad = decl * .pi / 180
        let angleRad = angle * .pi / 180
        let cosHA = (sin(angleRad) - sin(latRad) * sin(declRad)) / (cos(latRad) * cos(declRad))
        guard cosHA >= -1 && cosHA <= 1 else { return 0 }
        return acos(cosHA) * 180 / .pi
    }
    
    private static func asrHourAngle(lat: Double, decl: Double) -> Double {
        let latRad = lat * .pi / 180
        let declRad = decl * .pi / 180
        let shadowRatio = 1.0 + tan(abs(latRad - declRad))
        let angle = atan(1.0 / shadowRatio)
        let cosHA = (sin(angle) - sin(latRad) * sin(declRad)) / (cos(latRad) * cos(declRad))
        guard cosHA >= -1 && cosHA <= 1 else { return 0 }
        return acos(cosHA) * 180 / .pi
    }
}