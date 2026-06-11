import { EventEmitter } from 'events';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class DuplicateFinder extends EventEmitter {
	calculateHash(filePath) {
		return new Promise((resolve, reject) => {
			const hash = crypto.createHash('sha256');
			const stream = fs.createReadStream(filePath);

			stream.on('data', (chunk) => hash.update(chunk));
			stream.on('end', () => resolve(hash.digest('hex')));
			stream.on('error', reject);
		});
	}

	async findDuplicates(directory) {
		this.emit('search-start', { directory });

		const groups = new Map();
		let totalFiles = 0;

		try {
			const files = await fsp.readdir(directory, { recursive: true });
			const filePaths = [];

			for (const relativePath of files) {
				const absolutePath = path.join(directory, relativePath);
				try {
					const stat = await fsp.stat(absolutePath);
					if (stat.isFile()) {
						filePaths.push({ path: absolutePath, size: stat.size });
					}
				} catch {}
			}

			totalFiles = filePaths.length;
			let processed = 0;

			for (const file of filePaths) {
				try {
					const hash = await this.calculateHash(file.path);
					if (!groups.has(hash)) {
						groups.set(hash, []);
					}
					groups.get(hash).push(file);
				} catch (err) {
				}
				processed++;
				this.emit('file-processed', { current: processed, total: totalFiles });
			}

			const duplicateGroups = [];
			let totalWastedSpace = 0;

			for (const [hash, fileList] of groups.entries()) {
				if (fileList.length > 1) {
					const fileSize = fileList[0].size;
					const copiesCount = fileList.length;
					const wasted = fileSize * (copiesCount - 1);
					totalWastedSpace += wasted;

					duplicateGroups.push({
						hash,
						size: fileSize,
						copies: fileList.map((f) => path.relative(directory, f.path)),
						wastedSpace: wasted,
					});
				}
			}

			this.emit('duplicates-found', { duplicateGroups, totalWastedSpace });
		} catch (error) {
			throw error;
		}
	}
}
