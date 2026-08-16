const path = require("path");

const enableHealthCheck = process.env.ENABLE_HEALTH_CHECK === "true";
let healthPlugin = null;
if (enableHealthCheck) {
  try {
    healthPlugin = require("./plugins/health-check/webpack-health-plugin");
  } catch (e) {
    healthPlugin = null;
  }
}

module.exports = {
  webpack: {
    alias: { "@": path.resolve(__dirname, "src") },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**"],
        aggregateTimeout: 300,
      };
      if (healthPlugin && healthPlugin.WebpackHealthPlugin) {
        webpackConfig.plugins.push(new healthPlugin.WebpackHealthPlugin());
      }
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    // react-scripts 5 emits legacy middleware options removed in webpack-dev-server v5
    const { onBeforeSetupMiddleware, onAfterSetupMiddleware, https, ...rest } = devServerConfig;
    return {
      ...rest,
      allowedHosts: "all",
      setupMiddlewares: (middlewares, devServer) => {
        if (onBeforeSetupMiddleware) onBeforeSetupMiddleware(devServer);
        if (onAfterSetupMiddleware) onAfterSetupMiddleware(devServer);
        return middlewares;
      },
    };
  },
};
