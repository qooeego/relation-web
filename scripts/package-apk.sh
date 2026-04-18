#!/usr/bin/env bash
set -euo pipefail

APP_ID="film.camera.app"
APP_NAME="Film Camera"

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm not found. Please install Node.js first."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "[ERROR] npx not found. Please install Node.js first."
  exit 1
fi

echo "[1/6] Installing web dependencies..."
npm install

echo "[2/6] Building web bundle..."
npm run build

echo "[3/6] Installing Capacitor packages..."
npm install @capacitor/core @capacitor/cli @capacitor/android

if [ ! -f "capacitor.config.ts" ] && [ ! -f "capacitor.config.json" ]; then
  echo "[4/6] Initializing Capacitor..."
  npx cap init "$APP_ID" "$APP_NAME" --web-dir=dist
else
  echo "[4/6] Capacitor already initialized."
fi

if [ ! -d "android" ]; then
  echo "[5/6] Adding Android platform..."
  npx cap add android
else
  echo "[5/6] Android platform already exists."
fi

echo "[6/6] Syncing web assets to Android..."
npx cap sync android

echo "Done."
echo "Next steps:"
echo "  1) npx cap open android"
echo "  2) Android Studio > Build > Build APK(s)"
