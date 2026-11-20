// The iOS web view has no download handling, so in the app the export goes to
// a cache file and out through the share sheet. The plugins load on demand:
// only the app ever requests them.
const loadPlugins = async () => {
  const [fs, share] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  // Wrapped in an object on purpose: a plugin proxy answers `then`, so one
  // returned bare from an async function is taken for a promise.
  return {
    Filesystem: fs.Filesystem,
    Directory: fs.Directory,
    Encoding: fs.Encoding,
    Share: share.Share,
  };
};

// The Share plugin rejects with this message, and no code, when the sheet is
// dismissed without an action.
const SHEET_DISMISSED = 'Share canceled';

/**
 * @returns {Promise<boolean>} true once an action in the sheet completed,
 *   false when the sheet was dismissed
 */
export async function shareExportFile({ filename, json }, load = loadPlugins) {
  const { Filesystem, Directory, Encoding, Share } = await load();
  const file = { path: filename, directory: Directory.Cache };
  const { uri } = await Filesystem.writeFile({ ...file, data: json, encoding: Encoding.UTF8 });
  try {
    await Share.share({ files: [uri] });
    return true;
  } catch (err) {
    if (err?.message === SHEET_DISMISSED) return false;
    throw err;
  } finally {
    await Filesystem.deleteFile(file).catch(() => {});
  }
}
