/**
 * JSON file persistence helpers.
 */
const fs = require('fs').promises;
const path = require('path');

async function readJsonFile(filePath) {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

async function writeJsonFileAtomic(filePath, value, options = {}) {
  const spaces = options.spaces ?? 2;
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, spaces)}\n`, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

module.exports = {
  readJsonFile,
  writeJsonFileAtomic
};
