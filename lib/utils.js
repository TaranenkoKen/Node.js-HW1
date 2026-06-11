import path from 'path';

export function formatSize(bytes) {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function drawProgressBar(current, total, width = 20) {
	if (total === 0) return '░'.repeat(width) + ' 0/0';
	const percentage = Math.min(current / total, 1);
	const filled = Math.round(percentage * width);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
	return `${bar} ${current}/${total} files`;
}

export function handleFsError(error, directory) {
	const resolvedPath = path.resolve(directory);
	if (error.code === 'ENOENT') {
		console.error(`Error: Directory or file not found: ${resolvedPath}`);
	} else if (error.code === 'EACCES') {
		console.error(`Error: Permission denied: ${resolvedPath}`);
	} else {
		console.error(`Unexpected error: ${error.message}`);
	}
	process.exit(1);
}
