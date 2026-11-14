const fs = require('fs')
const path = require('path')
const plink = require('pear-link')

const pkg = require('./package.json')
const appName = pkg.productName ?? pkg.name

function getWindowsKitVersion() {
  const programFiles = process.env['PROGRAMFILES(X86)'] || process.env.PROGRAMFILES
  if (!programFiles) return undefined
  const kitsDir = path.join(programFiles, 'Windows Kits')
  try {
    for (const kit of fs.readdirSync(kitsDir).sort().reverse()) {
      const binDir = path.join(kitsDir, kit, 'bin')
      if (!fs.existsSync(binDir)) continue
      const version = fs
        .readdirSync(binDir)
        .filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
        .sort()
        .pop()
      if (version) return version
    }
  } catch {
    return undefined
  }
}

let packagerConfig = {
  icon: path.join(__dirname, 'build', 'icon'),
  // Submission-only files must never enter a distributable. Keep runtime deps.
  ignore: [
    /^\/(?:out|dist|coverage|tmp|temp)(?:\/|$)/,
    /(?:^|\/)(?:AGENTS[^/]*\.md|agent_docs|\.local|\.private|\.tooling|\.local-tooling|\.agents|\.codex|\.git|\.github|\.aws|\.ssh|\.idea|\.vscode|\.cache|\.nyc_output)(?:\/|$)/,
    /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.netrc|credentials(?:\.json)?|id_rsa|id_ed25519)(?:\/|$)/,
    /(?:^|\/)[^/]+\.local\.[^/]+$/,
    /\.(?:key|pem|p12|pfx|jks|log|tmp|sqlite|sqlite3|db|mobileprovision|provisionprofile)$/,
    /(?:^|\/)(?:\.DS_Store|npm-debug\.log[^/]*|yarn-error\.log[^/]*|[^/]+\.tsbuildinfo)$/,
    // Exclude project storage at any depth, but keep runtime dependency packages.
    /^\/(?!node_modules\/)(?:[^/]+\/)*(?:tmp|temp|coverage|runbook-data|pear-runtime|app-storage|\.test-storage|\.local-storage|runbook-ui-[^/]+|runbook-test-[^/]+|runbook-[^/]+-test-[^/]+|runbook-branding-[^/]+|runbook-normal-verification-[^/]+)(?:\/|$)/
  ],
  protocols: [{ name: appName, schemes: [pkg.name] }],
  derefSymlinks: true
}

if (process.argv.includes('--platform=mas')) {
  packagerConfig = {
    ...packagerConfig,
    osxSign: {
      identity: process.env.MAS_DISTRIBUTION_IDENTITY,
      provisioningProfile: process.env.MAS_PROVISIONING_PROFILE,
      optionsForFile: (filePath) => {
        let entitlements
        if (filePath.includes('.app/')) {
          entitlements = path.join(__dirname, 'build', 'entitlements.mas.inherit.plist')
        } else {
          entitlements = path.join(__dirname, 'build', 'entitlements.mas.plist')
        }
        return { entitlements, hardenedRuntime: false }
      }
    }
  }
} else if (process.env.MAC_CODESIGN_IDENTITY) {
  packagerConfig = {
    ...packagerConfig,
    osxSign: {
      identity: process.env.MAC_CODESIGN_IDENTITY,
      optionsForFile: () => ({
        entitlements: path.join(__dirname, 'build', 'entitlements.mac.plist')
      })
    },
    osxNotarize: {
      tool: 'notarytool',
      keychainProfile: process.env.KEYCHAIN_PROFILE
    }
  }
}

module.exports = {
  packagerConfig,

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {}
    },
    {
      name: '@electron-forge/maker-pkg',
      platforms: ['mas'],
      config: {
        identity: process.env.MAS_INSTALLER_DISTRIBUTION_IDENTITY
      }
    },
    {
      name: '@electron-forge/maker-msix',
      platforms: ['win32'],
      config: {
        appManifest: path.join(__dirname, 'build', 'AppxManifest.xml'),
        packageAssets: path.join(__dirname, 'build', 'msix-assets'),
        windowsKitVersion: getWindowsKitVersion(),
        ...(process.env.WINDOWS_SIGN_HOOK
          ? {
              windowsSignOptions: {
                hookModulePath: process.env.WINDOWS_SIGN_HOOK
              }
            }
          : {})
      }
    },
    {
      name: 'pear-electron-forge-maker-appimage',
      platforms: ['linux'],
      config: {
        icons: [
          { file: 'build/icon/icon-16x16.png', size: 16 },
          { file: 'build/icon/icon-32x32.png', size: 32 },
          { file: 'build/icon/icon-64x64.png', size: 64 },
          { file: 'build/icon/icon-128x128.png', size: 128 },
          { file: 'build/icon/icon-256x256.png', size: 256 },
          { file: 'build/icon/icon-512x512.png', size: 512 }
        ]
      }
    },
    {
      name: 'pear-electron-forge-maker-flatpak',
      platforms: ['linux'],
      config: {
        appId: 'com.pears.HelloPear',
        icon: `${packagerConfig.icon}.png`,
        comment: 'Developer recovery playbooks powered by Autopass',
        categories: ['Development']
      }
    },
    {
      name: 'pear-electron-forge-maker-snap',
      platforms: ['linux'],
      config: {
        icon: `${packagerConfig.icon}.png`,
        snapcraft: {
          summary: 'Runbook developer recovery playbooks',
          description:
            'Runbook keeps searchable recovery checklists in Autopass storage with peer-to-peer Pear application updates.',
          app: {
            extensions: ['gnome'],
            plugs: [
              'desktop',
              'desktop-legacy',
              'home',
              'x11',
              'wayland',
              'audio-playback',
              'audio-record',
              'camera',
              'opengl',
              'network',
              'network-bind',
              'browser-support',
              'network-status'
            ],
            environment: {
              TMPDIR: '$XDG_RUNTIME_DIR'
            }
          },
          part: {
            'stage-packages': ['libatomic1']
          }
        }
      }
    }
  ],

  hooks: {
    readPackageJson: async (forgeConfig, packageJson) => {
      if (process.env.UPGRADE_KEY) {
        packageJson.upgrade = process.env.UPGRADE_KEY
      }

      try {
        plink.parse(packageJson.upgrade)
      } catch {
        throw new Error('Use `pear touch` to get a valid upgrade key for package.json#upgrade')
      }

      return packageJson
    },
    preMake: async () => {
      fs.rmSync(path.join(__dirname, 'out', 'make'), { recursive: true, force: true })

      const manifest = path.join(__dirname, 'build', 'AppxManifest.xml')
      const msixVersion = pkg.version.replace(/^(\d+\.\d+\.\d+)$/, '$1.0')
      const xml = fs.readFileSync(manifest, 'utf-8')
      fs.writeFileSync(manifest, xml.replace(/Version="[^"]*"/, `Version="${msixVersion}"`))
    },
    postMake: async (forgeConfig, results) => {
      for (const result of results) {
        if (result.platform !== 'win32') continue
        for (const artifact of result.artifacts) {
          if (!artifact.endsWith('.msix')) continue
          const standardDir = path.join(__dirname, 'out', `${appName}-win32-${result.arch}`)
          fs.mkdirSync(standardDir, { recursive: true })
          const dest = path.join(standardDir, path.basename(artifact))
          fs.renameSync(artifact, dest)
          fs.mkdirSync(path.dirname(artifact), { recursive: true })
          fs.copyFileSync(dest, artifact)
          result.artifacts[result.artifacts.indexOf(artifact)] = dest
        }
      }
    }
  },

  plugins: [
    {
      name: 'electron-forge-plugin-universal-prebuilds',
      config: {}
    },
    {
      name: 'electron-forge-plugin-prune-prebuilds',
      config: {}
    }
  ]
}
