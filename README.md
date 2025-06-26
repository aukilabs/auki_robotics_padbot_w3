# Auki Padbot W3

<div align="center">
  <img src="RobotGUI/src/auki_padbot_w3/assets/Auki Logo Black.png" alt="Auki Logo" width="200"/>
  <br/>
  <em>Demonstrating posemesh domain map deployment and REST-based navigation on Padbot W3 robots</em>
</div>

## Overview

This project demonstrates how to integrate and deploy **posemesh domain maps** on the Padbot W3 robot. The system provides a complete solution for autonomous robot navigation using spatial domain data, enabling the W3 to understand its environment and navigate intelligently within defined domains using REST APIs.

## Key Features

### 🤖 Robot Integration
- **Padbot W3 Support**: Full compatibility with the W3 robot model
- **SLAM Integration (REST API)**: Real-time Simultaneous Localization and Mapping via REST
- **Autonomous Navigation**: Intelligent pathfinding using domain maps
- **Pose Tracking**: Continuous robot position and orientation monitoring

### 🗺️ Posemesh Domain Integration
- **Domain Authentication**: Secure access to posemesh spatial domains
- **Map Download**: Automatic retrieval of domain-specific maps (STCM format)
- **Navmesh Generation**: Dynamic navigation mesh creation for pathfinding
- **Raycast Support**: Spatial querying for obstacle detection and avoidance

### 📱 React Native GUI
- **Cross-Platform**: Android and iOS support
- **Real-time Monitoring**: Live robot status and battery monitoring
- **Configuration Management**: Easy setup and credential management
- **Connection Status**: Visual feedback for robot and domain connectivity

### 🔧 Advanced Features
- **Home Dock Management**: Automatic home position setting and navigation
- **Patrol Points**: Configurable waypoint-based navigation
- **Battery Monitoring**: Real-time battery status tracking
- **Logging System**: Comprehensive debug and error logging

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Native  │    │   REST API       │    │   Padbot W3     │
│      GUI        │◄──►│   Integration    │◄──►│   Robot         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Domain Utils  │    │   SLAM Utils     │    │   Hardware      │
│   (Posemesh)    │    │   (REST)         │    │   (W3)          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌──────────────────┐
│   Posemesh API  │    │   Domain Maps    │
│   (Auth         │    │   (STCM Format)  │
│    & Maps)      │    │                  │
└─────────────────┘    └──────────────────┘
```

## Prerequisites

### Hardware Requirements
- **Padbot W3** robot
- Android device or emulator for GUI
- Network connectivity for domain access

### Software Requirements
- **Node.js** (>= 18)
- **React Native CLI**
- **Android Studio** (for Android development)
- **Java Development Kit (JDK)**
- **Posemesh Account** with domain access

### Dependencies
- React Native 0.78.0
- React 19.0.0

## Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd auki_padbot_w3
```

### 2. Install Dependencies
```bash
cd RobotGUI
npm install
```

### 3. Android Setup
```bash
# Navigate to Android directory
cd android

# Install Gradle dependencies
./gradlew clean
./gradlew build
```

### 4. Configuration
Edit `RobotGUI/android/app/src/auki_padbot_w3/assets/config.yaml`:

```yaml
# Default configuration
email: "your-email@example.com"
domain_id: "your-domain-id"
slam_ip: "127.0.0.1"  # W3 Robot IP address
slam_port: 1448
timeout_ms: 1000

domain:
  map_endpoint: "https://dsc.auki.network/spatial/crosssection"
  raycast_endpoint: "https://dsc.auki.network/spatial/raycast"
  navmesh_endpoint: "https://dsc.auki.network/spatial/restricttonavmesh"
```

### 5. Build and Run
```bash
# Start Metro bundler
npm start

# Run on Android device/emulator
npm run android
```

## Usage

### Initial Setup
1. **Launch the App**: Start the React Native application
2. **Configure Credentials**: Enter your posemesh email, password, and domain ID
3. **Test Connection**: Verify robot and domain connectivity
4. **Set Home Position**: Configure the robot's home dock location

### Robot Control
- **Connect**: Establish connection with the Padbot W3 robot
- **Download Map**: Retrieve domain-specific spatial map
- **Set Pose**: Initialize robot position and orientation
- **Navigate**: Execute autonomous navigation commands

### Domain Integration
- **Authentication**: Secure access to posemesh domains
- **Map Retrieval**: Download STCM format domain maps
- **Navmesh Generation**: Create navigation meshes for pathfinding
- **Pose Reporting**: Continuous position updates to domain

Further information can be found at https://github.com/aukilabs/auki_robotics_map_utils

## API Reference

### Domain Utils Module
```typescript
// Authentication
authenticate(email: string, password: string, domainId: string): Promise<AuthResult>

// Map Operations
downloadMap(): Promise<MapResult>
getNavmeshCoord(coordinates: CoordMap): Promise<NavmeshResult>

// Pose Management
writeRobotPose(poseData: string, method: string, dataId?: string): Promise<PoseResult>
```

### SLAM Utils Module (REST)
```typescript
// Connection Management
checkConnection(): Promise<ConnectionStatus>
connectToRobot(ip: string, port: number): Promise<ConnectionResult>

// Navigation
navigateHome(x: number, y: number, yaw: number): Promise<NavigationResult>
setHomeDock(x: number, y: number, z: number, yaw: number, pitch: number, roll: number): Promise<HomeDockResult>
```

## Configuration Options

### Robot Settings
- **IP Address**: Robot network address (default: 127.0.0.1)
- **Port**: SLAM service port (default: 1448)
- **Timeout**: Connection timeout in milliseconds

### Domain Settings
- **Map Endpoint**: Domain map download URL
- **Raycast Endpoint**: Spatial query service URL
- **Navmesh Endpoint**: Navigation mesh generation URL

### Navigation Settings
- **Patrol Points**: Configurable waypoint coordinates
- **Speed Settings**: Different speeds for various operations
- **Home Dock**: Robot charging station position

## Troubleshooting

### Common Issues

#### Connection Problems
```bash
# Check robot network connectivity
ping 127.0.0.1

# Verify SLAM service is running
telnet 127.0.0.1 1448
```

#### Authentication Errors
- Verify posemesh credentials
- Check domain ID validity
- Ensure network connectivity to posemesh services

#### Build Issues
```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew build

# Clear React Native cache
npx react-native start --reset-cache
```

### Debug Logging
Enable debug logging by checking the logs in:
- `debug_log.txt` - General application logs
- `logcat.txt` - Android system logs

## Development

### Project Structure

```
auki_padbot_w3/
└── RobotGUI/                  # React Native application
    ├── android/               # Android-specific code and native modules
    ├── src/
    │   ├── auki_padbot_w3/
    │   │   ├── assets/        # Images, config, and static files
    │   │   ├── components/    # Reusable UI components
    │   │   ├── screens/       # Application screens
    │   │   ├── utils/         # Utility functions
    │   │   └── app/           # App entry point
    │   └── ...
    ├── package.json
    └── ...
```

### Adding New Features
1. **Native Modules**: Add Android/Kotlin modules in `android/app/src/main/java/`
2. **React Components**: Create new components in `src/auki_padbot_w3/components/`
3. **Screens**: Add new screens in `src/auki_padbot_w3/screens/`
4. **Configuration**: Update `config.yaml` for new settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For technical support or questions:
- **Email**: robotics@aukilabs.com
- **Issues**: Report bugs and feature requests through the project repository

---

<div align="center">
  <em>Auki Labs - Share your vision.</em>
</div>
