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

      const headerContent = `#import <React/RCTBridgeModule.h>

@interface WidgetKitHelper : NSObject <RCTBridgeModule>
@end
`;

      const implContent = `#import "WidgetKitHelper.h"
#import <WidgetKit/WidgetKit.h>

@implementation WidgetKitHelper

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(reloadAllTimelines)
{
  if (@available(iOS 14.0, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [WidgetCenter.shared reloadAllTimelines];
    });
  }
}

@end
`;

      fs.mkdirSync(iosPath, { recursive: true });
      fs.writeFileSync(path.join(iosPath, "WidgetKitHelper.h"), headerContent);
      fs.writeFileSync(path.join(iosPath, "WidgetKitHelper.m"), implContent);

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectName = config.modRequest.projectName;

    const headerFileName = "WidgetKitHelper.h";
    const implFileName = "WidgetKitHelper.m";

    const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;

    const existingSources = xcodeProject.pbxSourcesBuildPhaseObj();
    const alreadyAdded = existingSources && existingSources.files &&
      existingSources.files.some((f) => {
        const ref = xcodeProject.getPBXGroupByKeyAndType(f.value, "PBXBuildFile");
        return ref && ref.fileRef_comment === implFileName;
      });

    if (!alreadyAdded) {
      const groupKey = xcodeProject.findPBXGroupKey({ name: projectName }) ||
                       xcodeProject.findPBXGroupKey({ path: projectName });

      if (groupKey) {
        xcodeProject.addSourceFile(
          `${projectName}/${implFileName}`,
          { target: xcodeProject.getFirstTarget().uuid },
          groupKey
        );
        xcodeProject.addHeaderFile(
          `${projectName}/${headerFileName}`,
          {},
          groupKey
        );
      }
    }

    const buildSettings = xcodeProject.getBuildProperty("OTHER_LDFLAGS");
    if (buildSettings) {
      const targetBuildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
      for (const key in targetBuildConfigs) {
        if (typeof targetBuildConfigs[key] === "object" && targetBuildConfigs[key].buildSettings) {
          const ldFlags = targetBuildConfigs[key].buildSettings.OTHER_LDFLAGS;
          if (Array.isArray(ldFlags) && !ldFlags.includes('"-framework"') && !ldFlags.some((f) => f === '"WidgetKit"')) {
            ldFlags.push('"-framework"', '"WidgetKit"');
          }
        }
      }
    }

    return config;
  });

  return config;
}

module.exports = withWidgetKitHelper;
