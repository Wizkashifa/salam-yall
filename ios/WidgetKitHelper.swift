import Foundation
import WidgetKit

@objc(WidgetKitHelper)
class WidgetKitHelper: NSObject {
    @objc static func requiresMainQueueSetup() -> Bool { return false }

    @objc func reloadAllTimelines() {
        if #available(iOS 14.0, *) {
            DispatchQueue.main.async { WidgetCenter.shared.reloadAllTimelines() }
        }
    }
}
