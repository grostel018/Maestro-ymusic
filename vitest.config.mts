import path from "node:path";
import { defineConfig } from "vitest/config";

const appSrc = path.resolve("apps/maestro/src");

const isCi = process.env.CI === "true";

export default defineConfig({
	resolve: {
		alias: {
			"@main": path.join(appSrc, "main"),
			"@shared": path.join(appSrc, "shared"),
		},
	},
	test: {
		name: "maestro-workspace",
		environment: "node",
		include: ["apps/**/src/**/*.{test,spec}.ts", "apps/*/tests/**/*.test.ts", "packages/**/src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/out/**", "**/dist/**", "**/.vite/**"],
		reporters: isCi ? ["default", "junit"] : ["default"],
		outputFile: isCi
			? {
					junit: "test-results/junit.xml",
				}
			: undefined,
	},
});
