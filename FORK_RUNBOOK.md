# Obscura VPN Fork — Maintenance Runbook

This is the complete workflow for maintaining your `obscuravpn-client` fork: syncing with
upstream, running pre-build checks, building/testing a dev version, and producing a final
notarized release. Part 1 is one-time setup (per Mac/user account); Part 2 onward is what
you'll repeat regularly.

Replace `YOUR-USERNAME`, `YOUR-BUNDLE-ID`, `YOUR-TEAM-ID`, and similar placeholders with your
own values if they ever change.

---

## Part 1 — One-Time Machine Setup

Only needed once per Mac (or per macOS user account, if you ever switch/create a new one).

### 1. Install Nix and enable flakes

```bash
sh <(curl -L https://nixos.org/nix/install)
```
*Installs the Nix package manager, which this project uses to provide a reproducible set of
build tools (Rust, cmake, Node, etc.) without polluting your system-wide setup.*

Quit and reopen Terminal fully afterward, then:

```bash
mkdir -p ~/.config/nix && echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
```
*Turns on "flakes," a Nix feature this project's build system depends on.*

### 2. Install cmake and Rust (rustup/cargo)

```bash
nix-env -iA nixpkgs.cmake nixpkgs.rustup
rustup default stable
```
*Installs the Rust toolchain (for the project's Rust core) and cmake, per-account since Nix
profile packages aren't shared automatically across macOS user accounts.*

### 3. Clone your fork

```bash
git clone git@github.com:YOUR-USERNAME/obscuravpn-client.git
cd obscuravpn-client
```
*Use the SSH URL (not HTTPS) from the start if your SSH key is already set up — see step 5.
If this errors because the key isn't set up yet, clone via HTTPS first and switch the remote
later with `git remote set-url origin git@github.com:YOUR-USERNAME/obscuravpn-client.git`.*

### 4. Create a local git tag

```bash
git tag -a v/0.0.0-dev -m "local dev tag"
```
*A build script uses `git describe` to generate a version number, which fails with "No names
found, cannot describe anything" if there's no tag at all. Forking doesn't copy the original
project's tags, so this creates a throwaway one. One-time per clone.*

### 5. Set up SSH keys for GitHub (auth + commit signing)

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
```
*Generates a key, loads it into the agent, and saves the passphrase to macOS Keychain (so you
won't be re-prompted every session), then copies the public key to your clipboard.*

- Go to **github.com → Settings → SSH and GPG keys → New SSH key**. Add it **twice**: once as
  an **Authentication Key**, once as a **Signing Key**.

Set up persistent key loading:
```bash
printf 'Host github.com\n  AddKeysToAgent yes\n  UseKeychain yes\n  IdentityFile ~/.ssh/id_ed25519\n' > ~/.ssh/config
```

Configure git to sign every commit automatically:
```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```
*Verify each with `git config --get <name>` after setting it — don't assume it took.*

Set up local signature verification (optional but recommended):
```bash
printf "%s %s\n" "$(git config --get user.email)" "$(cat ~/.ssh/id_ed25519.pub)" > ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```
*Lets `git log --show-signature` verify signatures locally, not just GitHub.*

Test the connection:
```bash
ssh -T git@github.com
```
*Should say "Hi YOUR-USERNAME! ... does not provide shell access" — that's success.*

### 6. Add the upstream remote (for syncing with the original project)

```bash
git remote add upstream https://github.com/Sovereign-Engineering/obscuravpn-client.git
```

### 7. One-time Apple Developer setup (only needed for final/notarized builds)

- **Developer ID Application certificate**: Xcode → Settings → Accounts → Manage Certificates
  → **+** → Developer ID Application.
- **Two Developer ID provisioning profiles** at
  developer.apple.com/account/resources/profiles/list: one for your main app's bundle ID, one
  for the system network extension's bundle ID. Download and double-click each to install.
- **Notarization credentials**: generate an app-specific password at appleid.apple.com
  (Sign-In and Security → App-Specific Passwords), then:
  ```bash
  xcrun notarytool store-credentials notarytool-password \
    --apple-id YOUR-APPLE-ID-EMAIL \
    --team-id YOUR-TEAM-ID \
    --password YOUR-APP-SPECIFIC-PASSWORD
  ```

```bash
nix-env -iA nixpkgs.create-dmg
```

---

## Part 2 — Regular Workflow: Sync, Check, Build, Test

Do this each time you sit down to work.

### 1. Sync your fork's `main` with upstream

```bash
git checkout main
git fetch upstream --tags
git describe --tags upstream/main
git log main..upstream/main --oneline
git merge --ff-only upstream/main
git push origin main
```
*`main` never has commits of its own, so this is always a clean "fast-forward" — no conflicts
possible. Pushes the update to your fork on GitHub.*

### 2. Bring the update into your feature branch

```bash
git checkout dns-lock
git merge main
```
*This one CAN produce a merge commit (your branch and `main` have both moved forward
independently). If a text editor (often Vim) opens asking for a commit message, the default
message is fine — press `Esc`, type `:wq`, press Enter to save and exit. If you'd rather use a
simpler editor for this: `git config --global core.editor "nano"`.*

If it reports a conflict, resolve the marked sections manually, then:
```bash
git status
git add <the resolved files>
```
*Run `git diff <the resolved files>` first if you want to double-check exactly what changed
before staging — useful if the automatic merge picked something unexpected. `git add -u`
stages every modified tracked file at once, if you'd rather not list them individually.*

Then commit as usual:
```bash
git commit -m "Short summary" -m "Longer paragraph explaining why, not just what."
git push
```
*For the summary line: use the imperative mood — "Add," "Fix," "Configure," "Update," not
"Added"/"Adds"/"Configuring." Convention is to think of it as completing the sentence "If
applied, this commit will ___." No trailing period on the summary line. The second `-m` is
optional — only add it if the summary alone doesn't explain the "why."*

What you do next depends on whether this is a regular dev sync or you're cutting a release:

**Daily dev builds**: that's it — just build and run. `git describe` will show a messy
`-N-gHASH` suffix in the version number automatically; that's expected and fine for everyday
testing, no tagging needed.

**Release builds** additionally need a tag, created right before running the build pipeline
(the tag is what the version number is generated from):
```bash
git tag -a v/1.177-YOUR-USERNAME.1 -m "Synced with upstream v1.177; adds DNS lock feature"
git push origin v/1.177-YOUR-USERNAME.1
```

### 3. Open the project in Xcode

```bash
nix develop --print-build-logs --command just xcode-open
```
*Opens the project with the Nix-provided environment already active. If you get a "cargo:
command not found" error during a build, it usually means Xcode was launched from a Terminal
session that predates cargo being installed — fully quit Xcode (Cmd+Q) and relaunch with this
same command from a fresh Terminal.*

### 4. Run pre-build checks

```bash
nix develop '.#web' --print-build-logs
cd obscura-ui
npx tsc --noEmit
```
*Type-checks the TypeScript/React UI code against the project's real settings. Should print
nothing and exit cleanly. Run `pnpm install` first if this is a fresh clone/account and you
get "Cannot find type definition file" errors — that means dependencies were never installed.*

```bash
git status
git diff <changed file>
```
*Always review exactly what changed before committing — confirms nothing unexpected slipped
in.*

### 5. Build and run the Dev Client

In Xcode: select the **Dev Client** scheme, destination **My Mac**, then **Cmd+B** to build,
**Cmd+R** to run.

- Approve any system prompts on first run: **System Settings → Privacy & Security** for a
  blocked system extension, and a floating "Would Like to Add VPN Configurations" dialog —
  click Allow on both.
- If every page loads blank/white: quit the app, kill any `WebContent` processes in Activity
  Monitor, relaunch. If still blank, restart your Mac. This is WebKit sandbox flakiness, not a
  sign of a real bug — most common on a freshly created macOS user account.
- If you have the official Obscura VPN app installed too: turn off its "Open at login" setting
  and quit it while testing, to avoid both system extensions running simultaneously (the
  system extension shares a config path that isn't namespaced per-build).

### 6. Test your changes

Manually exercise whatever you changed. For the DNS lock feature specifically: toggle it on,
set a password, confirm the DNS controls lock, try a wrong password (rejected) and the right
one (accepted), quit and relaunch the app to confirm it's still locked, then test disabling it.

### 7. Commit and push

```bash
git add <changed files>
git commit -m "Describe what changed"
git push
```
*Commits are signed automatically per the Part 1 setup. Check github.com for a green
"Verified" badge on the commit as final confirmation.*

---

## Part 3 — Building the Final Notarized Release (occasional)

Only needed when you actually want a distributable, notarized build — not for regular
day-to-day testing (that's the Dev Client above).

### 1. One-time per bundle ID/signing change: verify these are correct

- `apple/ExportOptions.plist` — `provisioningProfiles` dictionary keyed by your **bundle
  identifiers**, valued by your **exact profile names**; `teamID` set to your own team ID.
- In Xcode, for the **Obscura VPN** and **System Network Extension** targets → Build Settings
  → Release row only: `Code Signing Style` = Manual, `Code Signing Identity` = "Developer ID
  Application", `Provisioning Profile Specifier` = your exact profile name (type it directly
  rather than using the Signing & Capabilities picker, which can be unreliable), `Development
  Team` = your team ID.
- `contrib/bin/build-obscuravpn-dmg.bash` doesn't need editing — it looks up your "Developer
  ID Application" identity from the keychain automatically. If you have more than one such
  identity installed, it uses whichever one `security find-identity` lists first, so check
  which that'll be (and remove any you don't want picked) with:
  ```bash
  security find-identity -v -p codesigning
  ```

### 2. Run the full build/notarize/package pipeline

```bash
caffeinate -s ./contrib/bin/build-obscuravpn-dmg.bash
```
*`caffeinate -s` keeps your Mac from sleeping while plugged in — this step can take a while.
The script archives, exports, notarizes the app, staples the ticket, builds the DMG, signs it,
notarizes the DMG too, staples that, and verifies everything. Run it directly (not through
`nix develop`/`just build-dmg`) if you hit "tool 'xcodebuild' not found" — that specific nix
shell doesn't expose it.*

### 3. Be patient with notarization

Typical time is 10–25 minutes total. **Your first-ever submission(s) on a new Developer ID
account may take much longer** — hours, occasionally days — due to Apple's documented
"in-depth analysis" review for new accounts. This is normal, has no workaround, and clears on
its own. Check status anytime without re-submitting:

```bash
xcrun notarytool history --keychain-profile notarytool-password
```

Don't resubmit repeatedly while waiting — it just adds to the queue. Once your account clears
this initial review, subsequent submissions typically process in a couple of minutes.

If a run fails with a network timeout mid-wait, it's usually a local blip, not a real problem —
just rerun the script fresh afterward.

### 4. The result

A file named `Obscura VPN.dmg` in your project root — signed, notarized, and ready to
distribute or install.

---

## DNS Lock: Recovering a Lost Password

The "password protect DNS settings" feature has **no built-in recovery** — that's
intentional, so someone who's locked out can't just guess or reset their way past it. If the
password is genuinely lost, the only way back in is for someone with **administrator access
to that Mac** to reset it by hand. There's no button for this in the app.

### Why this works

The password itself is never stored — only a salted hash of it — inside a file that only
`root` can read or write:

```
/Library/Application Support/obscura-vpn/system-network-extension/config.json
```

A regular (non-admin) user can't touch this file at all. An administrator can, using `sudo`
to temporarily act as root — that's the whole mechanism.

### Steps

1. **Fully quit the app, and reboot the Mac if you can.** This matters because the
   background process that owns this file (the "system network extension") keeps its own
   copy of it in memory and rewrites the whole file whenever *any* setting changes. If you
   edit the file by hand while that process is still running, your edit can get silently
   overwritten the next time anyone changes an unrelated setting. Rebooting is the simplest
   way to be sure it's not running while you edit.

2. As an administrator, open the file with `sudo` in a text editor, for example:
   ```bash
   sudo nano "/Library/Application Support/obscura-vpn/system-network-extension/config.json"
   ```
   Find the two lines that look like this:
   ```
   "dns_lock_salt": "<some long string>",
   "dns_lock_hash": "<some long string>",
   ```
   and change both values to `null` (remove the quotes too), so they read:
   ```
   "dns_lock_salt": null,
   "dns_lock_hash": null,
   ```
   Save and exit (in `nano`: Ctrl+O, Enter, then Ctrl+X).

   *Don't delete the whole file instead.* That resets **everything** — the account login,
   every saved setting, and the cached WireGuard keys, for every macOS user on that Mac —
   which is a much bigger reset than "forgot one password" calls for.

3. Relaunch the app (or restart the Mac, if you rebooted in step 1). Open Settings — the DNS
   lock should now show as not configured.

### If you're the one setting this up

Since there's no in-app recovery, write the password down somewhere safe (a password
manager) the moment you set it. The steps above are a fallback for an administrator, not a
substitute for not losing the password in the first place.

---

## Quick Reference: Common Snags

| Symptom | Fix |
|---|---|
| `cargo: command not found` in Xcode build | Fully quit Xcode, relaunch via `nix develop --command just xcode-open` from a fresh Terminal |
| `tool 'xcodebuild' not found` | Run the script directly, not through `nix develop`/`just` |
| Stuck in Vim after a git merge | Press `Esc`, type `:wq`, Enter |
| All app pages blank/white | Quit app, kill `WebContent` in Activity Monitor, relaunch; reboot if it persists |
| `git push` asks for a password | Remote is on HTTPS — run `git remote set-url origin git@github.com:YOUR-USERNAME/obscuravpn-client.git` |
| SSH passphrase prompt every time | `~/.ssh/config` missing or `ssh-add --apple-use-keychain` never run |
| Notarization stuck "In Progress" for hours | Normal for a new Developer ID account's first submission(s) — just wait |
| Forgot the DNS lock password | No in-app fix — see "DNS Lock: Recovering a Lost Password" above (admin access required) |
