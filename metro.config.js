const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watchFolders = config.watchFolders || [];
config.resolver = {
  ...config.resolver,
  blockList: [/\.local\/.*/],
};

module.exports = config;
