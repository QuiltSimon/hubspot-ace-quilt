import type { InitialOptionsTsJest } from "ts-jest/dist/types";

const TEST_REGEX = "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$";

const config: InitialOptionsTsJest = {
  preset: "ts-jest",
  testRegex: TEST_REGEX,
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
  testEnvironment: "node",
  coverageReporters: ["json", ["lcov", { projectRoot: "./" }]],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  moduleNameMapper: {
    "^@libs(.*)$": "<rootDir>/src/libs$1",
  },
  setupFilesAfterEnv: ["<rootDir>/.jest/setEnvVars.ts"],
};

export default config;
