// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.4"),
        .package(name: "CapacitorApp", path: "../../../node_modules/.pnpm/@capacitor+app@8.1.0_@capacitor+core@8.3.4/node_modules/@capacitor/app"),
        .package(name: "CapacitorBackgroundRunner", path: "../../../node_modules/.pnpm/@capacitor+background-runner@3.0.0_@capacitor+core@8.3.4/node_modules/@capacitor/background-runner"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/.pnpm/@capacitor+haptics@8.0.2_@capacitor+core@8.3.4/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorInappbrowser", path: "../../../node_modules/.pnpm/@capacitor+inappbrowser@4.0.0_@capacitor+core@8.3.4/node_modules/@capacitor/inappbrowser"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/.pnpm/@capacitor+keyboard@8.0.3_@capacitor+core@8.3.4/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorLocalNotifications", path: "../../../node_modules/.pnpm/@capacitor+local-notifications@8.2.0_@capacitor+core@8.3.4/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPushNotifications", path: "../../../node_modules/.pnpm/@capacitor+push-notifications@8.1.1_@capacitor+core@8.3.4/node_modules/@capacitor/push-notifications"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/.pnpm/@capacitor+status-bar@8.0.2_@capacitor+core@8.3.4/node_modules/@capacitor/status-bar"),
        .package(name: "CapgoCapacitorUpdater", path: "../../../node_modules/.pnpm/@capgo+capacitor-updater@8.46.1_@capacitor+core@8.3.4/node_modules/@capgo/capacitor-updater")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBackgroundRunner", package: "CapacitorBackgroundRunner"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorInappbrowser", package: "CapacitorInappbrowser"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapgoCapacitorUpdater", package: "CapgoCapacitorUpdater")
            ]
        )
    ]
)
