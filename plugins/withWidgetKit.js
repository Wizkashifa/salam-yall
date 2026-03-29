const { withEntitlementsPlist, withXcodeProject, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withWidgetKitHelper(config) {
  config = withEntitlementsPlist(config, (config) => {
    const groups = config.modResults["com.apple.security.application-groups"] || [];
    if (!groups.includes("group.app.ummahconnect")) {
      groups.push("group.app.ummahconnect");
    }
    config.modResults["com.apple.security.application-groups"] = groups;
    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosPath = path.join(config.modRequest.projectRoot, "ios", config.modRequest.projectName);
      fs.mkdirSync(iosPath, { recursive: true });

      const swiftContent = `import Foundation
import WidgetKit

@objc(WidgetKitHelper)
class WidgetKitHelper: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func reloadAllTimelines() {
    if #available(iOS 14.0, *) {
      DispatchQueue.main.async {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
`;

      const bridgingHeaderContent = `#import <React/RCTBridgeModule.h>
`;

      const objcBridgeContent = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetKitHelper, NSObject)

RCT_EXTERN_METHOD(reloadAllTimelines)

@end
`;

      fs.writeFileSync(path.join(iosPath, "WidgetKitHelper.swift"), swiftContent);
      fs.writeFileSync(path.join(iosPath, "WidgetKitHelper.m"), objcBridgeContent);

      const bridgingHeaderPath = path.join(iosPath, `${config.modRequest.projectName}-Bridging-Header.h`);
      if (!fs.existsSync(bridgingHeaderPath)) {
        fs.writeFileSync(bridgingHeaderPath, bridgingHeaderContent);
      }

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectName = config.modRequest.projectName;
    const swiftFilePath = `${projectName}/WidgetKitHelper.swift`;
    const objcFilePath = `${projectName}/WidgetKitHelper.m`;

    const sourcesBuildPhase = xcodeProject.pbxSourcesBuildPhaseObj();
    let swiftAdded = false;
    let objcAdded = false;
    if (sourcesBuildPhase && sourcesBuildPhase.files) {
      swiftAdded = sourcesBuildPhase.files.some((f) =>
        f.comment && f.comment.includes("WidgetKitHelper.swift")
      );
      objcAdded = sourcesBuildPhase.files.some((f) =>
        f.comment && f.comment.includes("WidgetKitHelper.m")
      );
    }

    const groupKey = xcodeProject.findPBXGroupKey({ name: projectName }) ||
                     xcodeProject.findPBXGroupKey({ path: projectName });
    const target = xcodeProject.getFirstTarget().uuid;

    if (groupKey) {
      if (!swiftAdded) {
        xcodeProject.addSourceFile(swiftFilePath, { target }, groupKey);
      }
      if (!objcAdded) {
        xcodeProject.addSourceFile(objcFilePath, { target }, groupKey);
      }
    }

    const bridgingHeaderRelPath = `${projectName}/${projectName}-Bridging-Header.h`;
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in buildConfigs) {
      const entry = buildConfigs[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;
      const settings = entry.buildSettings;

      if (!settings.SWIFT_OBJC_BRIDGING_HEADER) {
        settings.SWIFT_OBJC_BRIDGING_HEADER = `"${bridgingHeaderRelPath}"`;
      }

      if (!settings.OTHER_LDFLAGS) {
        settings.OTHER_LDFLAGS = ['"$(inherited)"', '"-framework"', '"WidgetKit"'];
      } else if (Array.isArray(settings.OTHER_LDFLAGS)) {
        if (!settings.OTHER_LDFLAGS.some((f) => f === '"WidgetKit"')) {
          settings.OTHER_LDFLAGS.push('"-framework"', '"WidgetKit"');
        }
      }
    }

    return config;
  });

  return config;
}

module.exports = withWidgetKitHelper;
