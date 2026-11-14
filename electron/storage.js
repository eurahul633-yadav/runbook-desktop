const path = require('path')

// Keep the original packaged locations, including Local AppData on Windows.
// Development uses the same roots. Existing stores are never copied or merged.
module.exports = function storageRoot({ platform, home, env, name, explicit }) {
  if (explicit) return path.resolve(explicit)
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', name)
  if (platform === 'win32') return path.join(home, 'AppData', 'Local', name)
  if (env.SNAP_USER_COMMON) return path.join(env.SNAP_USER_COMMON, name)
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), name)
}
