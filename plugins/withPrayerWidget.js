const { withXcodeProject, withEntitlementsPlist, withInfoPlist, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_TARGET_NAME = "SalamPrayerWidget";
const WIDGET_BUNDLE_ID_SUFFIX = ".PrayerWidget";
const APP_GROUP_ID = "group.app.ummahconnect";
const WIDGET_DIR = "SalamPrayerWidget";
const APPLE_TEAM_ID = "AS6WZP258V";

function withPrayerWidget(config) {
  config = withAppGroupEntitlement(config);
  config = withWidgetTarget(config);
  return config;
}

function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [APP_GROUP_ID];
    return mod;
  });
}

function withWidgetTarget(config) {
  return withXcodeProject(config, async (mod) => {
    const xcodeProject = mod.modResults;
    const projectRoot = mod.modRequest.projectRoot;
    const bundleIdentifier = config.ios?.bundleIdentifier || "app.ummahconnect";
    const widgetBundleId = bundleIdentifier + WIDGET_BUNDLE_ID_SUFFIX;
    const iosPath = path.join(projectRoot, "ios");
    const widgetPath = path.join(iosPath, WIDGET_DIR);

    if (!fs.existsSync(widgetPath)) {
      fs.mkdirSync(widgetPath, { recursive: true });
    }

    const pluginDir = path.join(__dirname, "widget-files");
    const swiftFiles = ["SharedPrayerData.swift", "PrayerWidgetViews.swift", "SalamWidget.swift", "LockScreenWidgets.swift"];

    for (const file of swiftFiles) {
      const src = path.join(pluginDir, file);
      const dst = path.join(widgetPath, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }

    const widgetInfoPlist = {
      CFBundleDevelopmentRegion: "$(DEVELOPMENT_LANGUAGE)",
      CFBundleDisplayName: "Prayer Times",
      CFBundleExecutable: "$(EXECUTABLE_NAME)",
      CFBundleIdentifier: widgetBundleId,
      CFBundleInfoDictionaryVersion: "6.0",
      CFBundleName: "$(PRODUCT_NAME)",
      CFBundlePackageType: "$(PRODUCT_TYPE_PACKAGE_TYPE)",
      CFBundleShortVersionString: config.version || "1.0",
      CFBundleVersion: "1",
      NSExtension: {
        NSExtensionPointIdentifier: "com.apple.widgetkit-extension",
      },
    };

    const plistContent = buildPlistXml(widgetInfoPlist);
    fs.writeFileSync(path.join(widgetPath, "Info.plist"), plistContent);

    const entitlements = {
      "com.apple.security.application-groups": [APP_GROUP_ID],
    };
    const entitlementsContent = buildPlistXml(entitlements);
    fs.writeFileSync(path.join(widgetPath, `${WIDGET_TARGET_NAME}.entitlements`), entitlementsContent);

    const existingTargets = xcodeProject.pbxNativeTargetSection();
    const alreadyExists = Object.values(existingTargets).some(
      (t) => typeof t === "object" && t.name === `"${WIDGET_TARGET_NAME}"`
    );

    if (alreadyExists) {
      return mod;
    }

    const widgetTarget = xcodeProject.addTarget(
      WIDGET_TARGET_NAME,
      "app_extension",
      WIDGET_DIR,
      widgetBundleId
    );

    const targetUuid = widgetTarget.uuid;
    const buildConfigList = xcodeProject.pbxXCConfigurationList();
    const targetConfigListId = xcodeProject.pbxNativeTargetSection()[targetUuid]?.buildConfigurationList;

    if (targetConfigListId && buildConfigList[targetConfigListId]) {
      const configRefs = buildConfigList[targetConfigListId].buildConfigurations;
      for (const configRef of configRefs) {
        const config_obj = xcodeProject.pbxXCBuildConfigurationSection()[configRef.value];
        if (config_obj && config_obj.buildSettings) {
          config_obj.buildSettings.SWIFT_VERSION = "5.0";
          config_obj.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.0";
          config_obj.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
          config_obj.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${WIDGET_DIR}/${WIDGET_TARGET_NAME}.entitlements"`;
          config_obj.buildSettings.INFOPLIST_FILE = `"${WIDGET_DIR}/Info.plist"`;
          config_obj.buildSettings.TARGETED_DEVICE_FAMILY = `"1,2"`;
          config_obj.buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = "AccentColor";
          config_obj.buildSettings.ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME = "WidgetBackground";
          config_obj.buildSettings.GENERATE_INFOPLIST_FILE = "YES";
          config_obj.buildSettings.MARKETING_VERSION = config.version || "1.0";
          config_obj.buildSettings.CURRENT_PROJECT_VERSION = "1";
          config_obj.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
          config_obj.buildSettings.LD_RUNPATH_SEARCH_PATHS = `"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"`;
          config_obj.buildSettings.PRODUCT_NAME = `"$(TARGET_NAME)"`;
          config_obj.buildSettings.SKIP_INSTALL = "YES";
          config_obj.buildSettings.DEVELOPMENT_TEAM = `"${APPLE_TEAM_ID}"`;
          config_obj.buildSettings.CODE_SIGN_STYLE = '"Manual"';
          config_obj.buildSettings.CODE_SIGN_IDENTITY = '"Apple Distribution"';
        }
      }
    }

    let widgetGroupKey = xcodeProject.findPBXGroupKey({ name: WIDGET_DIR }) || xcodeProject.findPBXGroupKey({ path: WIDGET_DIR });
    if (!widgetGroupKey) {
      const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
      xcodeProject.addPbxGroup([], WIDGET_DIR, WIDGET_DIR, null);
      widgetGroupKey = xcodeProject.findPBXGroupKey({ name: WIDGET_DIR }) || xcodeProject.findPBXGroupKey({ path: WIDGET_DIR });
      if (widgetGroupKey) {
        const mainGroup = xcodeProject.getPBXGroupByKey(mainGroupId);
        if (mainGroup && mainGroup.children) {
          const alreadyLinked = mainGroup.children.some((c) => c.comment === WIDGET_DIR);
          if (!alreadyLinked) {
            mainGroup.children.push({ value: widgetGroupKey, comment: WIDGET_DIR });
          }
        }
      }
    }

    for (const file of swiftFiles) {
      xcodeProject.addSourceFile(
        `${WIDGET_DIR}/${file}`,
        { target: targetUuid },
        widgetGroupKey
      );
    }

    return mod;
  });
}

function buildPlistXml(obj) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n`;
  xml += `<plist version="1.0">\n`;
  xml += serializePlistValue(obj) + "\n";
  xml += `</plist>\n`;
  return xml;
}

function serializePlistValue(value, indent = "") {
  if (typeof value === "string") {
    return `${indent}<string>${escapeXml(value)}</string>`;
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return `${indent}<integer>${value}</integer>`;
    }
    return `${indent}<real>${value}</real>`;
  }
  if (typeof value === "boolean") {
    return `${indent}<${value}/>`;
  }
  if (Array.isArray(value)) {
    let result = `${indent}<array>\n`;
    for (const item of value) {
      result += serializePlistValue(item, indent + "  ") + "\n";
    }
    result += `${indent}</array>`;
    return result;
  }
  if (typeof value === "object" && value !== null) {
    let result = `${indent}<dict>\n`;
    for (const [key, val] of Object.entries(value)) {
      result += `${indent}  <key>${escapeXml(key)}</key>\n`;
      result += serializePlistValue(val, indent + "  ") + "\n";
    }
    result += `${indent}</dict>`;
    return result;
  }
  return `${indent}<string></string>`;
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = withPrayerWidget;
