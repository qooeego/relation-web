# Film Camera APK (Samsung S22+ 優先)

這個專案是一個 React + Vite 底片模擬相機，提供：

- 後鏡頭優先啟動（`facingMode: environment`）
- 4 種底片風格（Kodak Gold / Fuji Superia / CineStill 800T / B&W）
- 拍照後套用顆粒與漏光效果
- 匯出 JPG

## 一鍵準備 Android 打包環境

```bash
./scripts/package-apk.sh
```

腳本會自動執行：

1. `npm install`
2. `npm run build`
3. 安裝 Capacitor 套件
4. `npx cap init`（若尚未初始化）
5. `npx cap add android`（若尚未建立 Android 平台）
6. `npx cap sync android`

## 產出 APK（Samsung S22+）

腳本跑完後：

```bash
npx cap open android
```

接著在 Android Studio：

- 選擇 `Build > Build Bundle(s) / APK(s) > Build APK(s)`
- 安裝到 Samsung S22+ 測試

## 若你在公司內網遇到 npm 403

若安裝 `@capacitor/*` 出現 403（套件策略限制），請在可連到 npm registry 的網路環境執行 `./scripts/package-apk.sh`，或請管理員開放以下套件：

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`

## Samsung S22+ 測試建議

- Android 13/14 皆可
- 首次開啟需允許相機權限
- 建議使用後鏡頭主攝進行測試
- 若畫面黑屏，確認其他 App 沒有占用相機
