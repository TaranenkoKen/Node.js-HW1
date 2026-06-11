import { EventEmitter } from 'events';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

export class Organizer extends EventEmitter {
	constructor() {
		super();
		this.categories = {
			Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
			Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
			Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
			Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
			Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
			Other: [],
		};
	}

	getCategory(ext) {
		for (const [category, extensions] of Object.entries(this.categories)) {
			if (extensions.includes(ext.toLowerCase())) {
				return category;
			}
		}
		return 'Other';
	}

	async getUniqueTargetPath(targetFolder, filename) {
		let targetPath = path.join(targetFolder, filename);
		try {
			await fsp.access(targetPath);
			const ext = path.extname(filename);
			const base = path.basename(filename, ext);
			let counter = 1;

			while (true) {
				const newFilename = `${base}(${counter})${ext}`;
				targetPath = path.join(targetFolder, newFilename);
				try {
					await fsp.access(targetPath);
					counter++;
				} catch {
					break;
				}
			}
		} catch {
		}
		return targetPath;
	}

	async organize(sourceDir, targetDir) {
		this.emit('organize-start', { sourceDir, targetDir });

		const summary = {
			Documents: 0,
			Images: 0,
			Archives: 0,
			Code: 0,
			Videos: 0,
			Other: 0,
			totalCopied: 0,
			totalSize: 0,
		};

		try {
			const files = await fsp.readdir(sourceDir, { recursive: true });
			const filePaths = [];

			for (const relativePath of files) {
				const absolutePath = path.join(sourceDir, relativePath);
				try {
					const stat = await fsp.stat(absolutePath);
					if (stat.isFile()) {
						filePaths.push({ path: absolutePath, size: stat.size });
					}
				} catch {}
			}

			const totalFiles = filePaths.length;
			let processed = 0;

			for (const category of Object.keys(this.categories)) {
				await fsp.mkdir(path.join(targetDir, category), { recursive: true });
			}

			for (const file of filePaths) {
				const filename = path.basename(file.path);
				const ext = path.extname(filename);
				const category = this.getCategory(ext);
				const targetFolder = path.join(targetDir, category);

				const uniqueTargetPath = await this.getUniqueTargetPath(
					targetFolder,
					filename,
				);

				this.emit('copy-start', { name: filename });

				try {
					if (file.size < 10 * 1024 * 1024) {
						await fsp.copyFile(file.path, uniqueTargetPath);
					} else {
						await pipeline(
							fs.createReadStream(file.path),
							fs.createWriteStream(uniqueTargetPath),
						);
					}

					summary[category]++;
					summary.totalCopied++;
					summary.totalSize += file.size;
					this.emit('copy-complete', {
						current: ++processed,
						total: totalFiles,
					});
				} catch (err) {
					this.emit('copy-error', { name: filename, error: err.message });
				}
			}

			this.emit('organize-complete', summary);
		} catch (error) {
			throw error;
		}
	}
}
