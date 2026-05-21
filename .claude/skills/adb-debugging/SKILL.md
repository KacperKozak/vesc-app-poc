---
name: adb-debugging
description: Debug Android apps on connected devices with adb, including package discovery, logcat, app data inspection, SQLite reads, install/restart flows, and permission/state checks. Use when user mentions adb, connected phone/device, Android runtime debugging, logcat, app database/settings, or asks to verify app state on device.
---

# ADB Debugging

## Rules

- Use `adb devices` first when device state unknown.
- Prefer app package from project config, but verify with `adb shell pm list packages | rg "<name>"`.
- Use `run-as <package>` for debug apps; if denied, say app is not debuggable or package mismatch.
- Never clear app data, uninstall, force-stop, or overwrite device files unless user asks.
- Do not paste huge logcat output. Filter by package/tag and summarize.
- Pull/copy DB files with `-wal` and `-shm` together when SQLite WAL is active.

## Quick Checks

Device:

```sh
adb devices
adb shell getprop ro.product.model
adb shell dumpsys battery | head
```

Package:

```sh
adb shell pm list packages | rg "app|company|keyword"
adb shell pidof <package>
```

Launch:

```sh
adb shell monkey -p <package> 1
```

## Logs

Clear then reproduce:

```sh
adb logcat -c
adb logcat --pid=$(adb shell pidof <package>) *:V
```

Tag filter:

```sh
adb logcat -s ReactNativeJS VescSession AndroidRuntime
```

Crash scan:

```sh
adb logcat -d | rg -i "fatal exception|androidruntime|reactnativejs|exception|error"
```

## App Data

List files:

```sh
adb shell run-as <package> ls -la
adb shell run-as <package> find . -maxdepth 3 -type f
```

SQLite DB with WAL:

```sh
mkdir -p tmp/device-db
adb exec-out run-as <package> cat databases/<db>.db > tmp/device-db/<db>.db
adb exec-out run-as <package> cat databases/<db>.db-wal > tmp/device-db/<db>.db-wal
adb exec-out run-as <package> cat databases/<db>.db-shm > tmp/device-db/<db>.db-shm
sqlite3 tmp/device-db/<db>.db "PRAGMA table_list;"
```

Query table:

```sh
sqlite3 tmp/device-db/<db>.db "PRAGMA table_info(<table>); SELECT * FROM <table>;"
```

Shared prefs:

```sh
adb shell run-as <package> ls -la shared_prefs
adb exec-out run-as <package> cat shared_prefs/<file>.xml
```

## Install/Restart

Build/install only when user asks or task requires native code on device:

```sh
cd android && ./gradlew :app:installDebug
adb shell monkey -p <package> 1
```

Restart app only when safe:

```sh
adb shell am force-stop <package>
adb shell monkey -p <package> 1
```

Ask before `force-stop` if user is actively using app.

## Diagnosis Pattern

1. Confirm device and package.
2. Confirm installed build matches changed native code when relevant.
3. Reproduce with filtered logs.
4. Inspect durable state with `run-as`.
5. Compare expected app state to DB/prefs/logs.
6. Report exact evidence and next smallest fix.
