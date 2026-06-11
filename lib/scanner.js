import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export class Scanner extends EventEmitter {
	async scan(directory) {
		this.emit('scan-start', { directory });

		const stats = {
			totalFiles: 0,
			totalSize: 0,
			byType: new Map(),
			age: {
				last7Days: 0,
				last30Days: 0,
				olderThan90: 0,
			},
			largestFiles: [],
			oldestFile: null,
		};

		try {
			const files = await fs.readdir(directory, { recursive: true });
			const totalToProcess = files.length;

			let processedCount = 0;
			const now = Date.now();

			for (const relativePath of files) {
				const absolutePath = path.join(directory, relativePath);
				let fileStats;

				try {
					fileStats = await fs.stat(absolutePath);
				} catch {
					processedCount++;
					continue;
				}

				if (fileStats.isFile()) {
					stats.totalFiles++;
					stats.totalSize += fileStats.size;

					const ext = path.extname(absolutePath).toLowerCase() || '(other)';
					if (!stats.byType.has(ext)) {
						stats.byType.set(ext, { count: 0, totalSize: 0 });
					}
					const typeData = stats.byType.get(ext);
					typeData.count++;
					typeData.totalSize += fileStats.size;

					const fileAgeDays =
						(now - fileStats.mtime.getTime()) / (1000 * 60 * 60 * 24);
					if (fileAgeDays <= 7) stats.age.last7Days++;
					else if (fileAgeDays <= 30) stats.age.last30Days++;
					else if (fileAgeDays > 90) stats.age.olderThan90++;

					stats.largestFiles.push({
						name: path.basename(absolutePath),
						size: fileStats.size,
					});
					stats.largestFiles.sort((a, b) => b.size - a.size);
					if (stats.largestFiles.length > 3) stats.largestFiles.pop();

					if (
						!stats.oldestFile ||
						fileStats.mtime.getTime() < stats.oldestFile.mtime
					) {
						stats.oldestFile = {
							name: path.basename(absolutePath),
							mtime: fileStats.mtime.getTime(),
							daysAgo: Math.floor(fileAgeDays),
						};
					}

					processedCount++;
					this.emit('file-found', {
						current: processedCount,
						total: totalToProcess,
					});
				} else {
					processedCount++;
				}
			}

			this.emit('scan-complete', stats);
		} catch (error) {
			throw error;
		}
	}
}
