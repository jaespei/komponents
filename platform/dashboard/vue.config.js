const path = require("path");
module.exports = {
  "transpileDependencies": [
    "vuetify"
  ],
  "configureWebpack": {
    resolve: {
      alias: {
        "@modeler": path.resolve(__dirname, '../../modeler/src')
      }
    }
  }
}