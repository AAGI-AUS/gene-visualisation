const path = require("path");
const HtmlBundlerPlugin = require("html-bundler-webpack-plugin");

module.exports = {
  mode: "production",
  output: {
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new HtmlBundlerPlugin({
      // all the necessary options are in one place
      entry: {
        index: "./build/index.html", // save generated HTML into dist/index.html
      },
      js: {
        inline: true,
      },
      css: {
        inline: true,
      },
      minify: false,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(css|scss)$/,
        use: ["css-loader"],
      },
      {
        test: /\.(ico|png|jpe?g|svg|ttf)$/,
        type: "asset/inline", // inline all images into HTML/CSS
      },
    ],
  },
};
