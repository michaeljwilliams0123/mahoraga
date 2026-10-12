#!/usr/bin/env bash
# Optional Linux/macOS runner. Never changes sovereign Windows job eligibility.
set -euo pipefail
mode="\${1:-inspect}"
case "$mode" in inspect|enroll) ;; *) echo 'Usage: bash scripts/portable-runner-enroll.sh [inspect|enroll]' >&2; exit 64 ;; esac
repo='michaeljwilliams0123/mahoraga'
version='2.337.0'
for tool in node gh git bash curl tar; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 65; }
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 24 )); then echo 'Node.js 24 or newer is required' >&2; exit 65; fi
platform="$(uname -s)"
arch="$(uname -m)"
case "$platform:$arch" in
  Linux:x86_64) asset="actions-runner-linux-x64-$version.tar.gz"; sha='70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613' ;;
  Linux:aarch64|Linux:arm64) asset="actions-runner-linux-arm64-$version.tar.gz"; sha='9b1dc70626422526e3c94767cf024896beb15da5342a3f4819bf2feac13e0393' ;;
  Darwin:x86_64) asset="actions-runner-osx-x64-$version.tar.gz"; sha='d383f505d7ed041b1873ab68c35dd766fc093f2252330f95bb427be8f2c6dcfc' ;;
  Darwin:arm64) asset="actions-runner-osx-arm64-$version.tar.gz"; sha='5a2cd92908a93d7276a194e1de6008099f3e7946f3f8e14aa7a1a7b4a31fdec2' ;;
  *) echo 'Unsupported OS/architecture: no implicit fallback.' >&2; exit 66 ;;
esac
runner_dir="\${MAHORAGA_RUNNER_DIRECTORY:-$HOME/.mahoraga/actions-runner}"
case "$runner_dir" in /*) ;; *) echo 'Runner directory must be absolute.' >&2; exit 65 ;; esac
if [[ "$mode" == 'inspect' ]]; then
  printf 'status=inspect-only\nrepository=%s\nplatform=%s\nasset=%s\nregistration=no; credentials=untouched; paidFallback=false\n' "$repo" "$platform:$arch" "$asset"
  exit 0
fi
# Public fork PRs may execute untrusted code on a self-hosted runner.
if [[ "$(gh api "repos/$repo" --jq .private 2>/dev/null || true)" != true ]]; then
  echo 'Refusing self-hosted enrollment: repository must be private and GH authenticated as owner/admin.' >&2
  exit 67
fi
if [[ -e "$runner_dir" ]]; then
  echo 'Runner directory exists; refusing to overwrite a registered identity.' >&2
  exit 68
fi
if [[ "$platform" == Linux ]] && ! sudo -n true 2>/dev/null; then
  echo 'Linux service enrollment requires preconfigured passwordless sudo; no partial registration attempted.' >&2
  exit 69
fi
host_name="$(hostname | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
name="mahoraga-\${host_name:0:30}-$(node -p 'require("node:crypto").randomBytes(4).toString("hex")')"
archive="$(mktemp "\${TMPDIR:-/tmp}/mahoraga-runner.XXXXXXXX")"
token=''
cleanup() { token=''; rm -f -- "$archive"; }
trap cleanup EXIT
curl --fail --location --retry 2 --proto '=https' --tlsv1.2 --silent --show-error \
  "https://github.com/actions/runner/releases/download/v$version/$asset" -o "$archive"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$archive" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$archive" | cut -d' ' -f1)"
fi
if [[ "$actual" != "$sha" ]]; then echo 'GitHub runner SHA256 mismatch: refusing installation.' >&2; exit 70; fi
mkdir -p -m 700 "$runner_dir"
tar -xzf "$archive" -C "$runner_dir"
[[ -x "$runner_dir/config.sh" ]] || { echo 'Verified archive missing config.sh' >&2; exit 71; }
token="$(gh api --method POST "repos/$repo/actions/runners/registration-token" --jq .token 2>/dev/null)"
[[ -n "$token" ]] || { echo 'Registration token unavailable' >&2; exit 72; }
(
  cd "$runner_dir"
  ./config.sh --unattended --url "https://github.com/$repo" --token "$token" \
    --name "$name" --labels 'mahoraga,zero-credit' --work _work
  if [[ "$platform" == Linux ]]; then
    sudo -n ./svc.sh install
    sudo -n ./svc.sh start
  else
    ./svc.sh install
    ./svc.sh start
  fi
)
printf 'enrolled=%s\nlabels=self-hosted,%s,%s,mahoraga,zero-credit\n' "$name" "$platform" "$arch"
echo 'Verify runner online in GitHub. Linux/macOS does not match Windows sovereign work.'
