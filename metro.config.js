const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watcher = {
  ...config.watcher,
  additionalExclusions: [/\.local\//],
};

module.exports = config;
