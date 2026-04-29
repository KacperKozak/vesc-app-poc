const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.blockList = [/.*\.test\.[jt]sx?$/, /.*\/__tests__\/.*/]
config.resolver.assetExts.push('wasm')

module.exports = config
