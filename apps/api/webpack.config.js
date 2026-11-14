const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/server.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      // Prisma Client loads a platform-specific query engine at runtime.
      // Keep it out of the bundle so Node resolves the generated client and
      // native engine from node_modules.
      externalDependencies: ['@prisma/client', 'pino', 'swagger-ui-express'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
