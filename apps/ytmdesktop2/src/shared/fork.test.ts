import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { FORK } from "./fork";

const builder = parse(fs.readFileSync(path.join(__dirname, "..", "..", "electron-builder.yml"), "utf8"));

describe("electron-builder.yml fork identity", () => {
	it("uses the fork app id and product name", () => {
		expect(builder.appId).toBe(FORK.appId);
		expect(builder.productName).toBe(FORK.productName);
	});

	it("packages a package.json whose name and productName are the fork's, never the upstream app's", () => {
		// Electron derives the default userData folder from these; upstream's is "YouTube Music for Desktop"
		expect(builder.extraMetadata).toMatchObject({ name: FORK.packageName, productName: FORK.productName });
	});
});
