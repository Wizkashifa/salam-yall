const { withXcodeProject, withInfoPlist } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_NAME = "SalamYallWidgetExtension";
const BUNDLE_ID_SUFFIX = ".widget";

function withSalamWidget(config) {
  config = withInfoPlist(config, (config) => {
    return config;
  });

  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const appBundleId = config.ios?.bundleIdentifier || "com.salamyall";
    const widgetBundleId = appBundleId + BUNDLE_ID_SUFFIX;
    const projectRoot = config.modRequest.projectRoot;
    const widgetSourceDir = path.join(projectRoot, "widgets", "SalamYallWidget");
    const iosDir = path.join(projectRoot, "ios");
    const widgetTargetDir = path.join(iosDir, WIDGET_NAME);

    const existingTargets = xcodeProject.pbxNativeTargetSection();
    for (const key in existingTargets) {
      if (existingTargets[key] && existingTargets[key].name === `"${WIDGET_NAME}"`) {
        return config;
      }
    }

    if (!fs.existsSync(widgetTargetDir)) {
      fs.mkdirSync(widgetTargetDir, { recursive: true });
    }

    const swiftFiles = ["SalamYallWidget.swift", "PrayerCalculation.swift", "WidgetViews.swift"];
    for (const file of swiftFiles) {
      const src = path.join(widgetSourceDir, file);
      const dst = path.join(widgetTargetDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }

    const infoPlistSrc = path.join(widgetSourceDir, "Info.plist");
    const infoPlistDst = path.join(widgetTargetDir, "Info.plist");
    if (fs.existsSync(infoPlistSrc)) {
      fs.copyFileSync(infoPlistSrc, infoPlistDst);
    }

    const widgetGroup = xcodeProject.addPbxGroup(
      [...swiftFiles, "Info.plist"],
      WIDGET_NAME,
      WIDGET_NAME
    );

    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(widgetGroup.uuid, mainGroupId);

    const widgetTarget = xcodeProject.addTarget(
      WIDGET_NAME,
      "app_extension",
      WIDGET_NAME,
      widgetBundleId
    );

    for (const file of swiftFiles) {
      xcodeProject.addSourceFile(
        `${WIDGET_NAME}/${file}`,
        { target: widgetTarget.uuid },
        widgetGroup.uuid
      );
    }

    const appTarget = xcodeProject.getFirstTarget().firstTarget;
    const appTargetUuid = appTarget.uuid;

    const widgetProductFileRef = widgetTarget.pbxNativeTarget.productReference;

    const embedBuildFileUuid = xcodeProject.generateUuid();
    const embedBuildFileCommentKey = `${embedBuildFileUuid}_comment`;

    xcodeProject.hash.project.objects["PBXBuildFile"][embedBuildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: widgetProductFileRef,
      settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
    };
    xcodeProject.hash.project.objects["PBXBuildFile"][embedBuildFileCommentKey] = `${WIDGET_NAME}.appex in Embed App Extensions`;

    const embedPhaseUuid = xcodeProject.generateUuid();
    const embedPhaseCommentKey = `${embedPhaseUuid}_comment`;

    xcodeProject.hash.project.objects["PBXCopyFilesBuildPhase"] = xcodeProject.hash.project.objects["PBXCopyFilesBuildPhase"] || {};
    xcodeProject.hash.project.objects["PBXCopyFilesBuildPhase"][embedPhaseUuid] = {
      isa: "PBXCopyFilesBuildPhase",
      buildActionMask: 2147483647,
      dstPath: '""',
      dstSubfolderSpec: 13,
      files: [
        { value: embedBuildFileUuid, comment: `${WIDGET_NAME}.appex in Embed App Extensions` },
      ],
      name: '"Embed App Extensions"',
      runOnlyForDeploymentPostprocessing: 0,
    };
    xcodeProject.hash.project.objects["PBXCopyFilesBuildPhase"][embedPhaseCommentKey] = "Embed App Extensions";

    appTarget.buildPhases.push({
      value: embedPhaseUuid,
      comment: "Embed App Extensions",
    });

    const depTargetProxy = xcodeProject.generateUuid();
    const depTargetProxyComment = `${depTargetProxy}_comment`;
    const projectUuid = xcodeProject.getFirstProject().firstProject.uuid;

    xcodeProject.hash.project.objects["PBXContainerItemProxy"] = xcodeProject.hash.project.objects["PBXContainerItemProxy"] || {};
    xcodeProject.hash.project.objects["PBXContainerItemProxy"][depTargetProxy] = {
      isa: "PBXContainerItemProxy",
      containerPortal: projectUuid,
      proxyType: 1,
      remoteGlobalIDString: widgetTarget.uuid,
      remoteInfo: `"${WIDGET_NAME}"`,
    };
    xcodeProject.hash.project.objects["PBXContainerItemProxy"][depTargetProxyComment] = "PBXContainerItemProxy";

    const depUuid = xcodeProject.generateUuid();
    const depUuidComment = `${depUuid}_comment`;

    xcodeProject.hash.project.objects["PBXTargetDependency"] = xcodeProject.hash.project.objects["PBXTargetDependency"] || {};
    xcodeProject.hash.project.objects["PBXTargetDependency"][depUuid] = {
      isa: "PBXTargetDependency",
      target: widgetTarget.uuid,
      targetProxy: depTargetProxy,
    };
    xcodeProject.hash.project.objects["PBXTargetDependency"][depUuidComment] = "PBXTargetDependency";

    if (!appTarget.dependencies) {
      appTarget.dependencies = [];
    }
    appTarget.dependencies.push({
      value: depUuid,
      comment: "PBXTargetDependency",
    });

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const cfg = configurations[key];
      if (
        cfg &&
        typeof cfg === "object" &&
        cfg.buildSettings &&
        cfg.buildSettings.PRODUCT_NAME === `"${WIDGET_NAME}"`
      ) {
        cfg.buildSettings.SWIFT_VERSION = "5.0";
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "17.0";
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${WIDGET_NAME}/${WIDGET_NAME}.entitlements"`;
        cfg.buildSettings.INFOPLIST_FILE = `"${WIDGET_NAME}/Info.plist"`;
        cfg.buildSettings.MARKETING_VERSION = "1.0.1";
        cfg.buildSettings.CURRENT_PROJECT_VERSION = "2";
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
        delete cfg.buildSettings.GENERATE_INFOPLIST_FILE;
      }
    }

    const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>`;
    const entitlementsPath = path.join(widgetTargetDir, `${WIDGET_NAME}.entitlements`);
    fs.writeFileSync(entitlementsPath, entitlementsContent);

    return config;
  });

  return config;
}

module.exports = withSalamWidget;