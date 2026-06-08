const { getDefaultConfig } = require('expo/metro-config')

/** Metro her zaman pods-mobile kökünü proje dizini saysın (üst klasör node_modules karışmasın). */
module.exports = getDefaultConfig(__dirname)
