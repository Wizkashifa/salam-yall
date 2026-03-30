import ExpoModulesCore
import WidgetKit

public class PrayerWidgetBridgeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PrayerWidgetBridge")

        AsyncFunction("updateWidgetData") { (jsonString: String) -> Bool in
            guard let defaults = UserDefaults(suiteName: "group.app.ummahconnect") else {
                return false
            }
            guard let data = jsonString.data(using: .utf8) else {
                return false
            }
            defaults.set(data, forKey: "prayer_widget_data")
            defaults.synchronize()

            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }

            return true
        }

        AsyncFunction("reloadTimelines") { () -> Bool in
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
                return true
            }
            return false
        }
    }
}
