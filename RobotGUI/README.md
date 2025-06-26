# Padbot W3 Demo Project

A basic Padbot W3 project which demonstrates map retrieval and basic navigation functionality.

---

## Project Structure

```
RobotGUI/
  ├── src/
  │   └── auki_padbot_w3/
  │        ├── app/           # Main app entry (App.tsx)
  │        ├── screens/       # UI screens (SplashScreen, ConfigScreen)
  │        ├── utils/         # Utility modules (logging, etc.)
  │        ├── assets/        # Static assets (images, icons)
  │        └── types/         # TypeScript type definitions
  ├── android/                # Android native project
  ├── node_modules/           # JS dependencies
  ├── package.json            # Project metadata and dependencies
  └── README.md               # This file
```

---

## Build & Run Instructions

### Prerequisites

- **Node.js** (Recommended: v16+)
- **npm** (Recommended: v8+)
- **Java JDK** (11 or newer)
- **Android Studio** (for emulator/device and SDK setup)
- **Gradle** (wrapper included, see below)

### Steps

1. **Install dependencies:**
   ```sh
   cd RobotGUI
   npm install
   ```

2. **Start Metro bundler:**
   ```sh
   npm start
   ```

3. **Build and run on Android:**
   ```sh
   cd android
   ./gradlew clean
   ./gradlew assembleRelease
   # or for debug build:
   # ./gradlew assembleDebug
   ```

4. **Install the APK on your device:**
   - The APK will be in `android/app/build/outputs/apk/release/`

---

## Dependencies

- **React Native:** 0.78.0
- **Gradle:** 8.12 (via wrapper)
- **react-native-vector-icons:** ^10.2.0
- **@react-native-community/cli:** 15.0.1
- **Other dependencies:** See `package.json` for the full list.

---

## Configuration

- No special configuration is required for basic usage.
- For advanced features, see comments in the codebase or contact the maintainer.

---

## Contributing

Pull requests and issues are welcome!  
Please open an issue to discuss your proposed changes before submitting a PR.

---

## License

[MIT](LICENSE) (or specify your license here)
