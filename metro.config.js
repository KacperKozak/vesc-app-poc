const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

config.resolver.blockList = [/.*\.test\.[jt]sx?$/, /.*\/__tests__\/.*/]

module.exports = withNativeWind(config, { input: './src/global.css' })
