// Renders build/icon.svg into every icon file the app and its installers use. Run after changing the SVG:
//   node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(app, "build/icon.svg"));
const render = (size) => sharp(svg, { density: Math.ceil((72 * size) / 1024) * 2 }).resize(size, size).png({ compressionLevel: 9 });

/** ICO: 256 px as PNG, smaller sizes as 32-bit bitmaps, which every Windows loader and NSIS accept. */
async function ico(sizes) {
	const images = [];
	for (const size of sizes) {
		if (size >= 256) {
			images.push({ size, data: await render(size).toBuffer() });
			continue;
		}
		const { data } = await render(size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		const header = Buffer.alloc(40);
		header.writeUInt32LE(40, 0);
		header.writeInt32LE(size, 4);
		header.writeInt32LE(size * 2, 8);
		header.writeUInt16LE(1, 12);
		header.writeUInt16LE(32, 14);
		const pixels = Buffer.alloc(size * size * 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const from = (y * size + x) * 4;
				const to = ((size - 1 - y) * size + x) * 4;
				pixels[to] = data[from + 2];
				pixels[to + 1] = data[from + 1];
				pixels[to + 2] = data[from];
				pixels[to + 3] = data[from + 3];
			}
		}
		const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
		images.push({ size, data: Buffer.concat([header, pixels, mask]) });
	}
	const dir = Buffer.alloc(6 + images.length * 16);
	dir.writeUInt16LE(1, 2);
	dir.writeUInt16LE(images.length, 4);
	let offset = dir.length;
	images.forEach(({ size, data }, i) => {
		const at = 6 + i * 16;
		dir.writeUInt8(size >= 256 ? 0 : size, at);
		dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
		dir.writeUInt16LE(1, at + 4);
		dir.writeUInt16LE(32, at + 6);
		dir.writeUInt32LE(data.length, at + 8);
		dir.writeUInt32LE(offset, at + 12);
		offset += data.length;
	});
	return Buffer.concat([dir, ...images.map((i) => i.data)]);
}

/** ICNS: PNG entries, one per Apple icon type. */
async function icns() {
	const entries = [];
	for (const [type, size] of [["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]]) {
		const png = await render(size).toBuffer();
		const head = Buffer.alloc(8);
		head.write(type, 0, "ascii");
		head.writeUInt32BE(png.length + 8, 4);
		entries.push(head, png);
	}
	const body = Buffer.concat(entries);
	const head = Buffer.alloc(8);
	head.write("icns", 0, "ascii");
	head.writeUInt32BE(body.length + 8, 4);
	return Buffer.concat([head, body]);
}

const pngDir = "src/renderer/src/assets/icons/png";
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
	const png = await render(size).toBuffer();
	writeFileSync(join(app, `build/${size}x${size}.png`), png);
	writeFileSync(join(app, `${pngDir}/${size}x${size}.png`), png);
}
const appIcon = await ico([16, 24, 32, 48, 64, 128, 256]);
for (const file of ["build/icon.ico", "build/favicon.ico", "resources/favicon.ico", "src/renderer/src/assets/icons/win/icon.ico"]) {
	writeFileSync(join(app, file), appIcon);
}
const macIcon = await icns();
for (const file of ["build/icon.icns", "src/renderer/src/assets/icons/mac/icon.icns"]) writeFileSync(join(app, file), macIcon);
console.log("icons written");
