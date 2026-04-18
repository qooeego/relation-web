# Film Camera APK (Samsung S22+ 優先)

這個專案是一個 React + Vite 底片模擬相機，提供：

- 後鏡頭優先啟動（`facingMode: environment`）
- 4 種底片風格（Kodak Gold / Fuji Superia / CineStill 800T / B&W）
- 拍照後套用顆粒與漏光效果
- 匯出 JPG

## 本機開發

```bash
npm install
npm run dev
```

在手機測試時，請使用 HTTPS（相機 API 需要安全環境），或直接打包成 Android App。

## 打包成 Android APK（建議給 Samsung S22+）

1. 安裝依賴

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android
```

2. 建立前端產物

```bash
npm run build
```

3. 初始化 Capacitor（第一次）

```bash
npx cap init film.camera.app "Film Camera" --web-dir=dist
```

4. 新增 Android 平台

```bash
npx cap add android
```

5. 同步資源

```bash
npx cap sync android
```

6. 用 Android Studio 開啟並產出 APK

```bash
npx cap open android
```

之後在 Android Studio：

- 選擇 `Build > Build Bundle(s) / APK(s) > Build APK(s)`
- 安裝到 Samsung S22+ 測試

## Samsung S22+ 測試建議

- Android 13/14 皆可
- 首次開啟需允許相機權限
- 建議使用後鏡頭主攝進行測試
- 若畫面黑屏，確認其他 App 沒有占用相機
