import path from 'path';
import { Scanner } from './lib/scanner.js';
import { DuplicateFinder } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { Cleanup } from './lib/cleanup.js';
import { formatSize, drawProgressBar, handleFsError } from './lib/utils.js';

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
	console.log(
		'❌ Error: No command specified. Available: scan, duplicates, organize, cleanup',
	);
	process.exit(1);
}

async function main() {
	// --- КОМАНДА SCAN ---
	if (command === 'scan') {
		const targetDir = args[1];
		if (!targetDir) {
			console.error('❌ Error: Please specify directory path for scan.');
			process.exit(1);
		}

		const scanner = new Scanner();
		scanner.on('scan-start', (data) =>
			console.log(`📂 Scanning: ${path.resolve(data.directory)}`),
		);
		scanner.on('file-found', (data) => {
			process.stdout.write(
				`\rProcessing... ${drawProgressBar(data.current, data.total)}`,
			);
		});

		scanner.on('scan-complete', (stats) => {
			console.log('\n\n📊 Scan Results:');
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log(`Total files: ${stats.totalFiles}`);
			console.log(`Total size:  ${formatSize(stats.totalSize)}`);
			console.log('\nBy File Type:');

			const sortedTypes = [...stats.byType.entries()].sort(
				(a, b) => b[1].count - a[1].count,
			);
			for (const [ext, data] of sortedTypes) {
				console.log(
					`  ${ext.padEnd(8)} ${data.count.toString().padEnd(5)} files   ${formatSize(data.totalSize)}`,
				);
			}

			console.log('\nFile Age:');
			console.log(`  Last 7 days:    ${stats.age.last7Days} files`);
			console.log(`  Last 30 days:   ${stats.age.last30Days} files`);
			console.log(`  Older than 90:  ${stats.age.olderThan90} files`);

			console.log('\nLargest files:');
			stats.largestFiles.forEach((file, index) => {
				console.log(
					`  ${index + 1}. ${file.name.padEnd(25)} ${formatSize(file.size)}`,
				);
			});

			if (stats.oldestFile) {
				console.log(
					`\nOldest file: ${stats.oldestFile.name} (modified ${stats.oldestFile.daysAgo} days ago)`,
				);
			}
		});

		try {
			await scanner.scan(targetDir);
		} catch (err) {
			handleFsError(err, targetDir);
		}
	}

	// --- КОМАНДА DUPLICATES ---
	else if (command === 'duplicates') {
		const targetDir = args[1];
		if (!targetDir) {
			console.error(
				'❌ Error: Please specify directory path for duplicate search.',
			);
			process.exit(1);
		}

		const finder = new DuplicateFinder();
		finder.on('search-start', (data) =>
			console.log(
				`🔍 Searching for duplicates in: ${path.resolve(data.directory)}`,
			),
		);
		finder.on('file-processed', (data) => {
			process.stdout.write(
				`\rCalculating hashes... ${drawProgressBar(data.current, data.total)}`,
			);
		});

		finder.on('duplicates-found', (data) => {
			console.log(
				`\n\nFound ${data.duplicateGroups.length} duplicate groups (${formatSize(data.totalWastedSpace)} wasted):\n`,
			);

			data.duplicateGroups.forEach((group, index) => {
				console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
				console.log(
					`Group ${index + 1} (${group.copies.length} copies, ${formatSize(group.size)} each):`,
				);
				console.log(`  SHA-256: ${group.hash.substring(0, 12)}...`);
				console.log('');
				group.copies.forEach((file) => console.log(`  📄 ${file}`));
				console.log(`\n  Wasted space: ${formatSize(group.wastedSpace)}`);
			});

			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log(
				`💾 Total wasted space: ${formatSize(data.totalWastedSpace)}`,
			);
		});

		try {
			await finder.findDuplicates(targetDir);
		} catch (err) {
			handleFsError(err, targetDir);
		}
	}

	// --- КОМАНДА ORGANIZE ---
	else if (command === 'organize') {
		const sourceDir = args[1];
		const outputIdx = args.indexOf('--output');
		const targetDir = outputIdx !== -1 ? args[outputIdx + 1] : null;

		if (!sourceDir || !targetDir) {
			console.error(
				'❌ Error: Usage: node file-organizer.js organize <source> --output <target>',
			);
			process.exit(1);
		}

		const organizer = new Organizer();
		organizer.on('organize-start', (data) => {
			console.log(`📦 Organizing: ${path.resolve(data.sourceDir)}`);
			console.log(`Target: ${path.resolve(data.targetDir)}\n`);
			console.log('Creating folders...');
			Object.keys(organizer.categories).forEach((cat) =>
				console.log(`  ✓ ${cat}/`),
			);
			console.log('');
		});

		organizer.on('copy-complete', (data) => {
			process.stdout.write(
				`\rCopying files... ${drawProgressBar(data.current, data.total)}`,
			);
		});

		organizer.on('organize-complete', (summary) => {
			console.log('\n\n✅ Organization complete! Summary:');
			Object.keys(organizer.categories).forEach((cat) => {
				console.log(
					`  ${cat.padEnd(10)}: ${summary[cat].toString().padEnd(4)} files → Organized/${cat}/`,
				);
			});
			console.log(
				`\nTotal copied: ${summary.totalCopied} files (${formatSize(summary.totalSize)})`,
			);
		});

		try {
			await organizer.organize(sourceDir, targetDir);
		} catch (err) {
			handleFsError(err, sourceDir);
		}
	}

	// --- КОМАНДА CLEANUP ---
	else if (command === 'cleanup') {
		const targetDir = args[1];
		const olderThanIdx = args.indexOf('--older-than');
		const daysThreshold =
			olderThanIdx !== -1 ? parseInt(args[olderThanIdx + 1], 10) : null;
		const confirmDelete = args.includes('--confirm');

		if (!targetDir || daysThreshold === null || isNaN(daysThreshold)) {
			console.error(
				'❌ Error: Usage: node file-organizer.js cleanup <path> --older-than <days> [--confirm]',
			);
			process.exit(1);
		}

		const cleaner = new Cleanup();

		cleaner.on('cleanup-start', (data) => {
			console.log(`🧹 Cleanup: ${path.resolve(data.directory)}`);
			console.log(
				`Looking for files older than ${data.daysThreshold} days...\n`,
			);
		});

		let foundAny = false;
		cleaner.on('file-found', (file) => {
			if (!foundAny) {
				console.log(
					'Found files to delete:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
				);
				foundAny = true;
			}
			console.log(`${file.relativePath}`);
			console.log(`  Size: ${formatSize(file.size)}`);
			console.log(
				`  Modified: ${file.daysOld} days ago (${file.modifiedDate})\n`,
			);
		});

		cleaner.on('cleanup-dryrun-complete', (data) => {
			if (!foundAny) console.log('No outdated files found.');
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log(
				`Total: ${data.files.length} files (${formatSize(data.totalSize)})`,
			);
			console.log('\n⚠️  DRY RUN MODE: No files were deleted.');
			console.log('To actually delete these files, run with --confirm flag.');
		});

		cleaner.on('deleting-start', (data) => {
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			console.log(
				`⚠️  DELETING ${data.count} files (${formatSize(data.totalSize)}). This action cannot be undone!`,
			);
		});

		cleaner.on('file-deleted', (data) => {
			process.stdout.write(
				`\rDeleting... ${drawProgressBar(data.current, data.total)}`,
			);
		});

		cleaner.on('cleanup-complete', (data) => {
			console.log(`\n\n✅ Cleanup complete!`);
			console.log(
				`Deleted: ${data.deletedCount} files (${formatSize(data.totalSize)} freed)`,
			);
		});

		try {
			await cleaner.runCleanup(targetDir, daysThreshold, confirmDelete);
		} catch (err) {
			handleFsError(err, targetDir);
		}
	} else {
		console.log(`❌ Error: Unknown command "${command}"`);
	}
}

main();
