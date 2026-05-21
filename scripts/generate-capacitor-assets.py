#!/usr/bin/env python3
"""Generate Construct Capacitor app icons and launch images.

This script intentionally keeps the source of truth inside this repository:
src/assets/logo.png is used directly for transparent web/PWA icons, and is
composited onto platform-required native icon/splash backgrounds where needed.
"""

from __future__ import annotations

import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError as exc:
    raise SystemExit("Pillow is required: python3 -m pip install Pillow") from exc


ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "src/assets/logo.png"
RESOURCE_DIR = ROOT / "resources/capacitor"

IOS_ICON = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
IOS_SPLASH_DIR = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset"

ANDROID_RES = ROOT / "android/app/src/main/res"

PUBLIC_ICONS = {
    "favicon.png": 512,
    "pwa-192x192.png": 192,
    "pwa-512x512.png": 512,
    "apple-touch-icon.png": 180,
}

ANDROID_LEGACY_ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

ANDROID_FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

ANDROID_SPLASH_SIZES = {
    "drawable/splash.png": (480, 320),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
}


def ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def cropped_logo() -> Image.Image:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    alpha_box = logo.getchannel("A").getbbox()
    if alpha_box:
        logo = logo.crop(alpha_box)
    return logo


def background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    img = Image.new("RGB", size, "#05070b")
    px = img.load()
    for y in range(height):
        for x in range(width):
            nx = (x / max(width - 1, 1)) - 0.5
            ny = (y / max(height - 1, 1)) - 0.5
            vignette = min(1.0, math.sqrt(nx * nx + ny * ny) * 1.35)
            blue = max(0.0, 1.0 - math.sqrt((nx + 0.22) ** 2 + (ny - 0.18) ** 2) * 2.2)
            warm = max(0.0, 1.0 - math.sqrt((nx - 0.28) ** 2 + (ny + 0.22) ** 2) * 2.3)
            r = int(6 + blue * 18 + warm * 78 - vignette * 5)
            g = int(8 + blue * 42 + warm * 32 - vignette * 5)
            b = int(14 + blue * 92 + warm * 22 - vignette * 4)
            px[x, y] = (max(0, r), max(0, g), max(0, b))

    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    dot_count = max(70, (width * height) // 42000)
    for i in range(dot_count):
        x = (i * 613) % width
        y = (i * 997) % height
        radius = 1 if width < 1000 else 2
        alpha = 12 + ((i * 17) % 26)
        color = (120, 174, 232, alpha) if i % 5 == 0 else (255, 255, 255, alpha)
        draw.ellipse((x, y, x + radius, y + radius), fill=color)
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def place_logo(
    base: Image.Image,
    logo: Image.Image,
    logo_width: int,
    y_offset: int = 0,
    shadow_alpha: int = 110,
) -> Image.Image:
    canvas = base.convert("RGBA")
    resized = logo.resize((logo_width, round(logo.height * logo_width / logo.width)), Image.Resampling.LANCZOS)
    x = (canvas.width - resized.width) // 2
    y = (canvas.height - resized.height) // 2 + y_offset

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_logo = Image.new("RGBA", resized.size, (0, 0, 0, 0))
    shadow_logo.putalpha(resized.getchannel("A").point(lambda p: int(p * shadow_alpha / 255)))
    shadow.alpha_composite(shadow_logo, (x, y + max(4, canvas.height // 90)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(6, canvas.width // 46)))

    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(resized, (x, y))
    return canvas


def save_png(img: Image.Image, path: Path, mode: str = "RGB") -> None:
    ensure_dir(path)
    img.convert(mode).save(path, "PNG", optimize=True)


def build_icon_source(logo: Image.Image, size: int = 1024) -> Image.Image:
    base = background((size, size))
    return place_logo(base, logo, round(size * 0.72), shadow_alpha=95)


def build_transparent_icon_source(logo: Image.Image, size: int = 1024) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    resized = logo.resize((round(size * 0.86), round(logo.height * (size * 0.86) / logo.width)), Image.Resampling.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def build_foreground_source(logo: Image.Image, size: int = 1024) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return place_logo(canvas, logo, round(size * 0.68), shadow_alpha=70)


def build_splash(logo: Image.Image, size: tuple[int, int]) -> Image.Image:
    width, height = size
    base = background(size)
    logo_width = round(min(width, height) * 0.28)
    return place_logo(base, logo, logo_width, shadow_alpha=85)


def main() -> None:
    logo = cropped_logo()
    RESOURCE_DIR.mkdir(parents=True, exist_ok=True)

    icon = build_icon_source(logo)
    web_icon = build_transparent_icon_source(logo)
    foreground = build_foreground_source(logo)
    splash_square = build_splash(logo, (2732, 2732))

    save_png(icon, RESOURCE_DIR / "icon.png")
    save_png(foreground, RESOURCE_DIR / "icon-foreground.png", "RGBA")
    save_png(splash_square, RESOURCE_DIR / "splash.png")

    for filename, size in PUBLIC_ICONS.items():
        save_png(web_icon.resize((size, size), Image.Resampling.LANCZOS), ROOT / "public" / filename, "RGBA")

    save_png(icon, IOS_ICON)
    for filename in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]:
        save_png(splash_square, IOS_SPLASH_DIR / filename)

    for density, size in ANDROID_LEGACY_ICON_SIZES.items():
        resized = web_icon.resize((size, size), Image.Resampling.LANCZOS)
        save_png(resized, ANDROID_RES / density / "ic_launcher.png", "RGBA")
        save_png(resized, ANDROID_RES / density / "ic_launcher_round.png", "RGBA")

    for density, size in ANDROID_FOREGROUND_SIZES.items():
        resized = foreground.resize((size, size), Image.Resampling.LANCZOS)
        save_png(resized, ANDROID_RES / density / "ic_launcher_foreground.png", "RGBA")

    for relative, size in ANDROID_SPLASH_SIZES.items():
        save_png(build_splash(logo, size), ANDROID_RES / relative)


if __name__ == "__main__":
    main()
