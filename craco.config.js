const CracoAlias = require("craco-alias");

module.exports = {
  babel: {
    plugins: ["styled-jsx/babel"],
  },
  plugins: [
    {
      plugin: CracoAlias,
      options: {
        source: "tsconfig",
        baseUrl: ".",
        tsConfigPath: "./tsconfig.json",
      },
    },
  ],
};
