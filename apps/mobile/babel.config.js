module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      // Resolve the `@/*` alias (mirrors tsconfig paths) for Metro + Jest.
      'module-resolver',
      {
        root: ['./src'],
        alias: { '@': './src' },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
  ],
}
