const { withDangerousMod, withEntitlementsPlist } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  getWidgetSwiftFiles,
  getWidgetKitHelperFiles,
  getWidgetEntitlements,
  getWidgetInfoPlist,
} = require("./widget-swift-files");

const WIDGET_NAME = "PrayerTimesWidget";
const WIDGET_BUNDLE_ID = "app.ummahconnect.PrayerTimesWidget";
const APP_GROUP = "group.app.ummahconnect";
const DEPLOYMENT_TARGET = "17.0";

function makeUUID(seed) {
  return crypto
    .createHash("md5")
    .update(seed)
    .digest("hex")
    .substring(0, 24)
    .toUpperCase();
}

function writeWidgetSourceFiles(projectRoot) {
  const widgetDir = path.join(projectRoot, "ios", WIDGET_NAME);
  if (!fs.existsSync(widgetDir)) {
    fs.mkdirSync(widgetDir, { recursive: true });
  }

  const swiftFiles = getWidgetSwiftFiles();
  for (const [fileName, content] of Object.entries(swiftFiles)) {
    fs.writeFileSync(path.join(widgetDir, fileName), content, "utf8");
  }

  const entitlements = getWidgetEntitlements();
  fs.writeFileSync(
    path.join(widgetDir, `${WIDGET_NAME}.entitlements`),
    entitlements,
    "utf8"
  );

  const infoPlist = getWidgetInfoPlist();
  fs.writeFileSync(path.join(widgetDir, "Info.plist"), infoPlist, "utf8");
}

function writeWidgetKitHelperFiles(projectRoot, projectName) {
  const appDir = path.join(projectRoot, "ios", projectName);
  const { swiftContent, objcBridge, bridgingHeader } = getWidgetKitHelperFiles();

  fs.writeFileSync(
    path.join(appDir, "WidgetKitHelper.swift"),
    swiftContent,
    "utf8"
  );
  fs.writeFileSync(
    path.join(appDir, "WidgetKitHelper.m"),
    objcBridge,
    "utf8"
  );

  const bridgingPath = path.join(appDir, `${projectName}-Bridging-Header.h`);
  if (!fs.existsSync(bridgingPath)) {
    fs.writeFileSync(bridgingPath, bridgingHeader, "utf8");
  }
}

function insertWidgetTargetRawText(pbxprojPath, projectName) {
  let content = fs.readFileSync(pbxprojPath, "utf8");

  if (content.includes(`productType = "com.apple.product-type.app-extension"`)) {
    return;
  }

  const sourceFiles = [
    "PrayerTimesWidget.swift",
    "Models.swift",
    "Provider.swift",
    "WidgetViews.swift",
    "TogglePrayerIntent.swift",
  ];

  const ids = {};
  for (const f of sourceFiles) {
    ids[`fr_${f}`] = makeUUID(`widget_fileref_${f}`);
    ids[`bf_${f}`] = makeUUID(`widget_buildfile_${f}`);
  }
  ids.productRef = makeUUID("widget_product_appex");
  ids.group = makeUUID("widget_group");
  ids.sourcesPhase = makeUUID("widget_sources_phase");
  ids.frameworksPhase = makeUUID("widget_frameworks_phase");
  ids.debugConfig = makeUUID("widget_config_debug");
  ids.releaseConfig = makeUUID("widget_config_release");
  ids.configList = makeUUID("widget_configlist");
  ids.target = makeUUID("widget_native_target");

  let fileRefBlock = "";
  for (const f of sourceFiles) {
    fileRefBlock += `\t\t${ids[`fr_${f}`]} /* ${f} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${f}; sourceTree = "<group>"; };\n`;
  }
  fileRefBlock += `\t\t${ids.productRef} /* ${WIDGET_NAME}.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = ${WIDGET_NAME}.appex; sourceTree = BUILT_PRODUCTS_DIR; };\n`;

  content = content.replace(
    "/* End PBXFileReference section */",
    fileRefBlock + "/* End PBXFileReference section */"
  );

  let buildFileBlock = "";
  for (const f of sourceFiles) {
    buildFileBlock += `\t\t${ids[`bf_${f}`]} /* ${f} in Sources */ = {isa = PBXBuildFile; fileRef = ${ids[`fr_${f}`]} /* ${f} */; };\n`;
  }

  content = content.replace(
    "/* End PBXBuildFile section */",
    buildFileBlock + "/* End PBXBuildFile section */"
  );

  const groupChildren = sourceFiles
    .map((f) => `\t\t\t\t${ids[`fr_${f}`]} /* ${f} */,`)
    .join("\n");
  const groupBlock = `\t\t${ids.group} /* ${WIDGET_NAME} */ = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n${groupChildren}\n\t\t\t);\n\t\t\tpath = ${WIDGET_NAME};\n\t\t\tsourceTree = "<group>";\n\t\t};\n`;

  content = content.replace(
    "/* End PBXGroup section */",
    groupBlock + "/* End PBXGroup section */"
  );

  const mainGroupRe = /([A-F0-9]{24}\s*(?:\/\*.*?\*\/\s*)?=\s*\{\s*isa\s*=\s*PBXGroup;\s*children\s*=\s*\([\s\S]*?\);\s*sourceTree\s*=\s*"<group>";\s*\})/;
  const mainGroupMatch = content.match(mainGroupRe);
  if (mainGroupMatch) {
    const mg = mainGroupMatch[0];
    const closeParen = mg.lastIndexOf(");");
    const updated =
      mg.substring(0, closeParen) +
      `\t\t\t\t${ids.group} /* ${WIDGET_NAME} */,\n\t\t\t` +
      mg.substring(closeParen);
    content = content.replace(mg, updated);
  }

  const productsRe =
    /(\/\*\s*Products\s*\*\/\s*=\s*\{\s*isa\s*=\s*PBXGroup;\s*children\s*=\s*\()([\s\S]*?)(\);)/;
  const productsMatch = content.match(productsRe);
  if (productsMatch) {
    content = content.replace(
      productsMatch[0],
      productsMatch[1] +
        productsMatch[2] +
        `\t\t\t\t${ids.productRef} /* ${WIDGET_NAME}.appex */,\n\t\t\t` +
        productsMatch[3]
    );
  }

  const sourcesFiles = sourceFiles
    .map((f) => `\t\t\t\t${ids[`bf_${f}`]} /* ${f} in Sources */,`)
    .join("\n");
  const sourcesPhaseBlock = `\t\t${ids.sourcesPhase} /* Sources */ = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${sourcesFiles}\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;

  content = content.replace(
    "/* End PBXSourcesBuildPhase section */",
    sourcesPhaseBlock + "/* End PBXSourcesBuildPhase section */"
  );

  if (!content.includes("/* Begin PBXFrameworksBuildPhase section */")) {
    content = content.replace(
      "/* Begin PBXGroup section */",
      "/* Begin PBXFrameworksBuildPhase section */\n/* End PBXFrameworksBuildPhase section */\n\n/* Begin PBXGroup section */"
    );
  }
  const frameworksPhaseBlock = `\t\t${ids.frameworksPhase} /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
  content = content.replace(
    "/* End PBXFrameworksBuildPhase section */",
    frameworksPhaseBlock + "/* End PBXFrameworksBuildPhase section */"
  );

  const buildSettings = `{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = "${WIDGET_NAME}/${WIDGET_NAME}.entitlements";
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = "${WIDGET_NAME}/Info.plist";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${DEPLOYMENT_TARGET};
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t\t"@executable_path/../../Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tOTHER_LDFLAGS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = "${WIDGET_BUNDLE_ID}";
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = 1;
\t\t\t}`;

  const debugConfigBlock = `\t\t${ids.debugConfig} /* Debug */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = ${buildSettings}\n\t\t\tname = Debug;\n\t\t};\n`;
  const releaseConfigBlock = `\t\t${ids.releaseConfig} /* Release */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = ${buildSettings}\n\t\t\tname = Release;\n\t\t};\n`;

  content = content.replace(
    "/* End XCBuildConfiguration section */",
    debugConfigBlock +
      releaseConfigBlock +
      "/* End XCBuildConfiguration section */"
  );

  const configListBlock = `\t\t${ids.configList} /* Build configuration list for PBXNativeTarget "${WIDGET_NAME}" */ = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${ids.debugConfig} /* Debug */,\n\t\t\t\t${ids.releaseConfig} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t};\n`;

  content = content.replace(
    "/* End XCConfigurationList section */",
    configListBlock + "/* End XCConfigurationList section */"
  );

  const nativeTargetBlock = `\t\t${ids.target} /* ${WIDGET_NAME} */ = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${ids.configList} /* Build configuration list for PBXNativeTarget "${WIDGET_NAME}" */;\n\t\t\tbuildPhases = (\n\t\t\t\t${ids.sourcesPhase} /* Sources */,\n\t\t\t\t${ids.frameworksPhase} /* Frameworks */,\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t);\n\t\t\tname = ${WIDGET_NAME};\n\t\t\tproductName = ${WIDGET_NAME};\n\t\t\tproductReference = ${ids.productRef} /* ${WIDGET_NAME}.appex */;\n\t\t\tproductType = "com.apple.product-type.app-extension";\n\t\t};\n`;

  content = content.replace(
    "/* End PBXNativeTarget section */",
    nativeTargetBlock + "/* End PBXNativeTarget section */"
  );

  const targetsRe = /(\/\*\s*Begin PBXProject section\s*\*\/[\s\S]*?targets\s*=\s*\()([\s\S]*?)(\);)/;
  const targetsMatch = content.match(targetsRe);
  if (targetsMatch) {
    content = content.replace(
      targetsMatch[0],
      targetsMatch[1] +
        targetsMatch[2] +
        `\t\t\t\t${ids.target} /* ${WIDGET_NAME} */,\n\t\t\t` +
        targetsMatch[3]
    );
  }

  fs.writeFileSync(pbxprojPath, content, "utf8");
}

function addWidgetKitHelperToPbxproj(pbxprojPath, projectName) {
  let content = fs.readFileSync(pbxprojPath, "utf8");

  if (content.includes("WidgetKitHelper.swift")) {
    return;
  }

  const swiftFr = makeUUID("helper_fileref_swift");
  const objcFr = makeUUID("helper_fileref_objc");
  const swiftBf = makeUUID("helper_buildfile_swift");
  const objcBf = makeUUID("helper_buildfile_objc");

  const fileRefs =
    `\t\t${swiftFr} /* WidgetKitHelper.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WidgetKitHelper.swift; sourceTree = "<group>"; };\n` +
    `\t\t${objcFr} /* WidgetKitHelper.m */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = WidgetKitHelper.m; sourceTree = "<group>"; };\n`;

  content = content.replace(
    "/* End PBXFileReference section */",
    fileRefs + "/* End PBXFileReference section */"
  );

  const buildFiles =
    `\t\t${swiftBf} /* WidgetKitHelper.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${swiftFr} /* WidgetKitHelper.swift */; };\n` +
    `\t\t${objcBf} /* WidgetKitHelper.m in Sources */ = {isa = PBXBuildFile; fileRef = ${objcFr} /* WidgetKitHelper.m */; };\n`;

  content = content.replace(
    "/* End PBXBuildFile section */",
    buildFiles + "/* End PBXBuildFile section */"
  );

  const appGroupRe = new RegExp(
    `(\\/\\*\\s*${projectName}\\s*\\*\\/\\s*=\\s*\\{\\s*isa\\s*=\\s*PBXGroup;\\s*children\\s*=\\s*\\()([\\s\\S]*?)(\\);)`
  );
  const appGroupMatch = content.match(appGroupRe);
  if (appGroupMatch) {
    content = content.replace(
      appGroupMatch[0],
      appGroupMatch[1] +
        appGroupMatch[2] +
        `\t\t\t\t${swiftFr} /* WidgetKitHelper.swift */,\n\t\t\t\t${objcFr} /* WidgetKitHelper.m */,\n\t\t\t` +
        appGroupMatch[3]
    );
  }

  const mainTargetSourcesRe =
    /([A-F0-9]{24}\s*\/\*\s*Sources\s*\*\/\s*=\s*\{\s*isa\s*=\s*PBXSourcesBuildPhase;\s*buildActionMask\s*=\s*2147483647;\s*files\s*=\s*\()([\s\S]*?)(\);)/;
  const sourcesMatch = content.match(mainTargetSourcesRe);
  if (sourcesMatch) {
    content = content.replace(
      sourcesMatch[0],
      sourcesMatch[1] +
        sourcesMatch[2] +
        `\t\t\t\t${swiftBf} /* WidgetKitHelper.swift in Sources */,\n\t\t\t\t${objcBf} /* WidgetKitHelper.m in Sources */,\n\t\t\t` +
        sourcesMatch[3]
    );
  }

  const bridgingHeaderSetting = `SWIFT_OBJC_BRIDGING_HEADER = "${projectName}/${projectName}-Bridging-Header.h";`;
  if (!content.includes("SWIFT_OBJC_BRIDGING_HEADER")) {
    content = content.replace(
      /SWIFT_VERSION = 5\.0;/g,
      `SWIFT_VERSION = 5.0;\n\t\t\t\t${bridgingHeaderSetting}`
    );
  }

  fs.writeFileSync(pbxprojPath, content, "utf8");
}

function injectPostIntegrateHook(podfilePath, projectName) {
  let podfileContent = fs.readFileSync(podfilePath, "utf8");

  if (podfileContent.includes("Embed App Extensions")) {
    return;
  }

  const hook = `
post_integrate do |installer|
  project_path = File.join(__dir__, '${projectName}.xcodeproj')
  project = Xcodeproj::Project.open(project_path)

  main_target = project.targets.find { |t| t.name == '${projectName}' }
  widget_target = project.targets.find { |t| t.name == '${WIDGET_NAME}' }

  if main_target && widget_target
    unless main_target.build_phases.any? { |p| p.respond_to?(:name) && p.name == 'Embed App Extensions' }
      embed_phase = main_target.new_copy_files_build_phase('Embed App Extensions')
      embed_phase.dst_subfolder_spec = '13'
      embed_phase.add_file_reference(widget_target.product_reference)
    end

    unless main_target.dependencies.any? { |d| d.target == widget_target }
      main_target.add_dependency(widget_target)
    end

    project.save
  end
end
`;

  const lastEndIdx = podfileContent.lastIndexOf("\nend");
  if (lastEndIdx !== -1) {
    podfileContent =
      podfileContent.substring(0, lastEndIdx + 4) +
      "\n" +
      hook +
      podfileContent.substring(lastEndIdx + 4);
  } else {
    podfileContent += "\n" + hook;
  }

  fs.writeFileSync(podfilePath, podfileContent, "utf8");
}

function withPrayerTimesWidget(config) {
  config = withEntitlementsPlist(config, (modConfig) => {
    modConfig.modResults["com.apple.security.application-groups"] = [APP_GROUP];
    return modConfig;
  });

  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const projectName = modConfig.modRequest.projectName;

      writeWidgetSourceFiles(projectRoot);
      writeWidgetKitHelperFiles(projectRoot, projectName);

      const pbxprojPath = path.join(
        projectRoot,
        "ios",
        `${projectName}.xcodeproj`,
        "project.pbxproj"
      );

      if (fs.existsSync(pbxprojPath)) {
        insertWidgetTargetRawText(pbxprojPath, projectName);
        addWidgetKitHelperToPbxproj(pbxprojPath, projectName);
      }

      const podfilePath = path.join(projectRoot, "ios", "Podfile");
      if (fs.existsSync(podfilePath)) {
        injectPostIntegrateHook(podfilePath, projectName);
      }

      return modConfig;
    },
  ]);

  return config;
}

module.exports = withPrayerTimesWidget;
