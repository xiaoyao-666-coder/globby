import fs from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {createTemporaryGitRepository, runGlobby} from './utilities.js';

for (const rule of ['build/', '**/build/', 'bui?d/', '[bc]uild/', 'build/\n!keep.log']) {
	for (const options of [{}, {stats: true}, {onlyFiles: false}]) {
		test(`directory-only rule ${JSON.stringify(rule)} preserves files with ${JSON.stringify(options)}`, async t => {
			const cwd = createTemporaryGitRepository();
			t.teardown(() => fs.rmSync(cwd, {recursive: true, force: true}));
			fs.writeFileSync(path.join(cwd, '.gitignore'), `${rule}\n`);
			fs.mkdirSync(path.join(cwd, 'src/build'), {recursive: true});
			fs.mkdirSync(path.join(cwd, 'nested'), {recursive: true});
			for (const file of ['build', 'nested/build', 'src/build/out.js']) {
				fs.writeFileSync(path.join(cwd, file), '');
			}

			const visited = [];
			const customFs = {
				...fs,
				readdir(...arguments_) {
					visited.push(path.resolve(arguments_[0]));
					// eslint-disable-next-line n/prefer-promises/fs -- fast-glob uses callbacks.
					return fs.readdir(...arguments_);
				},
				readdirSync(...arguments_) {
					visited.push(path.resolve(arguments_[0]));
					return fs.readdirSync(...arguments_);
				},
			};

			const result = await runGlobby(t, '**/*', {
				cwd,
				gitignore: true,
				fs: customFs,
				...options,
			});
			const files = result.map(entry => entry.path ?? entry).sort();
			t.deepEqual(files, options.onlyFiles === false ? ['build', 'nested', 'nested/build', 'src'] : ['build', 'nested/build']);
			t.false(visited.includes(path.join(cwd, 'src/build')), 'the ignored directory must not be read');
		});
	}
}

for (const rule of ['/build/', 'src/build/', '/bui?d/']) {
	test(`anchored directory-only rule ${rule} preserves a matching file`, async t => {
		const cwd = createTemporaryGitRepository();
		t.teardown(() => fs.rmSync(cwd, {recursive: true, force: true}));
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${rule}\n`);
		fs.mkdirSync(path.join(cwd, 'src'), {recursive: true});
		fs.writeFileSync(path.join(cwd, 'build'), '');
		fs.writeFileSync(path.join(cwd, 'src/build'), '');

		const result = await runGlobby(t, '**/*', {cwd, gitignore: true});
		t.deepEqual(result.sort(), ['build', 'src/build']);
	});
}

test('a nested directory-only rule preserves files in its scope', async t => {
	const cwd = createTemporaryGitRepository();
	t.teardown(() => fs.rmSync(cwd, {recursive: true, force: true}));
	fs.mkdirSync(path.join(cwd, 'src/nested/build'), {recursive: true});
	fs.mkdirSync(path.join(cwd, 'build'), {recursive: true});
	fs.writeFileSync(path.join(cwd, 'src/.gitignore'), 'build/\n');
	for (const file of ['build/keep.js', 'src/build', 'src/nested/build/out.js']) {
		fs.writeFileSync(path.join(cwd, file), '');
	}

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true});
	t.deepEqual(result.sort(), ['build/keep.js', 'src/build']);
});

test('directory-only rules do not hide custom ignore files with the same name', async t => {
	const cwd = createTemporaryGitRepository();
	t.teardown(() => fs.rmSync(cwd, {recursive: true, force: true}));
	fs.writeFileSync(path.join(cwd, '.gitignore'), 'build/\n');
	fs.writeFileSync(path.join(cwd, 'build'), '*.log\n');
	fs.writeFileSync(path.join(cwd, 'drop.log'), '');
	fs.writeFileSync(path.join(cwd, 'keep.js'), '');

	const result = await runGlobby(t, '**/*', {cwd, gitignore: true, ignoreFiles: '**/build'});
	t.deepEqual(result.sort(), ['build', 'keep.js']);
});
