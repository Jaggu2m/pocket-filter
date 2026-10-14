import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const targetDirectory = path.resolve('dist', 'db');
await mkdir(targetDirectory, { recursive: true });
await copyFile(path.resolve('src', 'db', 'schema.sql'), path.join(targetDirectory, 'schema.sql'));
