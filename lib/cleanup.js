import { EventEmitter } from 'events';
import fsp from 'fs/promises';
import path from 'path';

export class Cleanup extends EventEmitter {
	async runCleanup(directory, daysThreshold, confirmDelete) {
		this.emit('cleanup-start', { directory, daysThreshold, confirmDelete });

		const filesToDelete = [];
		let totalSize = 0;

		try {
			const files = await fsp.readdir(directory, { recursive: true });
			const now = Date.now();

			for (const relativePath of files) {
				const absolutePath = path.join(directory, relativePath);
				try {
					const stat = await fsp.stat(absolutePath);
					if (stat.isFile()) {
						const fileAgeDays =
							(now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);

						if (fileAgeDays > daysThreshold) {
							const fileData = {
								path: absolutePath,
								relativePath,
								size: stat.size,
								daysOld: Math.floor(fileAgeDays),
								modifiedDate: stat.mtime.toISOString().split('T')[0],
							};
							filesToDelete.push(fileData);
							totalSize += stat.size;
							this.emit('file-found', fileData);
						}
					}
				} catch {}
			}

			if (!confirmDelete) {
				this.emit('cleanup-dryrun-complete', {
					files: filesToDelete,
					totalSize,
				});
				return;
			}

			let deletedCount = 0;
			const totalToObserve = filesToDelete.length;

			this.emit('deleting-start', { count: totalToObserve, totalSize });

			for (const file of filesToDelete) {
				try {
					await fsp.unlink(file.path);
					deletedCount++;
					this.emit('file-deleted', {
						current: deletedCount,
						total: totalToObserve,
					});
				} catch (err) {
				}
			}

			this.emit('cleanup-complete', { deletedCount, totalSize });
		} catch (error) {
			throw error;
		}
	}
}
