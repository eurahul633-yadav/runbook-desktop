"""Read-only inventory for a workspace without Git; never opens ignored files.

Supports the simple basename/directory glob rules used by this project's .gitignore.
Prints candidate paths, not file contents or suspected secret values.
"""
import fnmatch
import os
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
rules = []
for line in (root / '.gitignore').read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    if line.startswith('!') or '/' in line.rstrip('/'):
        raise SystemExit('Unsupported ignore rule; review inventory matcher: ' + line)
    rules.append((line.rstrip('/'), line.endswith('/')))


def ignored(name, directory):
    return name == '.git' or any(fnmatch.fnmatchcase(name, pattern) and
                                (directory or not only_dirs)
                                for pattern, only_dirs in rules)


candidates = []
for base, dirs, files in os.walk(root, followlinks=False):
    dirs[:] = sorted(d for d in dirs if not ignored(d, True))
    for name in sorted(files):
        if not ignored(name, False):
            candidates.append(Path(base) / name)

patterns = [
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'AKIA[0-9A-Z]{16}'),
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{30,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{40,}'),
    re.compile(rb'sk-(?:proj-)?[A-Za-z0-9_-]{40,}')
]
failures = []
for file in sorted(candidates):
    relative = file.relative_to(root)
    print(relative)
    if file.is_symlink():
        failures.append(str(relative) + ': symlink needs manual review')
        continue
    data = file.read_bytes()
    if any(pattern.search(data) for pattern in patterns):
        failures.append(str(relative) + ': possible secret; inspect locally')
print(f'\n{len(candidates)} candidate files. Ignored files were not read.')
if failures:
    print('\n'.join(failures), file=sys.stderr)
    sys.exit(1)
print('PASS: no excluded local-tooling paths or recognized private-key/token patterns in candidates.')
