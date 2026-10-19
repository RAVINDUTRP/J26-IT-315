#!/usr/bin/env python3
"""
AquaShield — App Launcher Icon Generator
========================================
Generates all required Android and iOS launcher icon assets from assets/images/logo.png.
"""

import os
from PIL import Image

LOGO_PATH = "assets/images/logo.png"


def create_icon(logo: Image.Image, size: int, pad_ratio: float = 0.10, bg_color=(255, 255, 255, 255)):
    canvas = Image.new("RGBA", (size, size), bg_color)
    max_logo_dim = int(size * (1 - 2 * pad_ratio))

    w, h = logo.size
    ratio = min(max_logo_dim / w, max_logo_dim / h)
    new_w, new_h = int(w * ratio), int(h * ratio)
    resized_logo = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)

    offset_x = (size - new_w) // 2
    offset_y = (size - new_h) // 2
    canvas.paste(resized_logo, (offset_x, offset_y), resized_logo)
    return canvas


def main():
    if not os.path.exists(LOGO_PATH):
        print(f"Error: {LOGO_PATH} not found.")
        return

    logo = Image.open(LOGO_PATH).convert("RGBA")

    # Android mipmaps
    android_mipmaps = {
        "android/app/src/main/res/mipmap-mdpi/ic_launcher.png": 48,
        "android/app/src/main/res/mipmap-hdpi/ic_launcher.png": 72,
        "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png": 96,
        "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png": 144,
        "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png": 192,
    }

    for path, size in android_mipmaps.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        icon = create_icon(logo, size)
        icon.save(path, "PNG")
        print(f"[+] Android: {path} ({size}x{size})")

    # iOS app icons
    ios_icons = {
        "Icon-App-20x20@1x.png": 20,
        "Icon-App-20x20@2x.png": 40,
        "Icon-App-20x20@3x.png": 60,
        "Icon-App-29x29@1x.png": 29,
        "Icon-App-29x29@2x.png": 58,
        "Icon-App-29x29@3x.png": 87,
        "Icon-App-40x40@1x.png": 40,
        "Icon-App-40x40@2x.png": 80,
        "Icon-App-40x40@3x.png": 120,
        "Icon-App-60x60@2x.png": 120,
        "Icon-App-60x60@3x.png": 180,
        "Icon-App-76x76@1x.png": 76,
        "Icon-App-76x76@2x.png": 152,
        "Icon-App-83.5x83.5@2x.png": 167,
        "Icon-App-1024x1024@1x.png": 1024,
    }

    ios_dir = "ios/Runner/Assets.xcassets/AppIcon.appiconset"
    if os.path.exists(ios_dir):
        for filename, size in ios_icons.items():
            out_path = os.path.join(ios_dir, filename)
            icon = create_icon(logo, size, bg_color=(255, 255, 255, 255))
            rgb_icon = Image.new("RGB", (size, size), (255, 255, 255))
            rgb_icon.paste(icon, mask=icon.split()[3])
            rgb_icon.save(out_path, "PNG")
            print(f"[+] iOS: {out_path} ({size}x{size})")

    print("[SUCCESS] All launcher icons generated from logo.png.")


if __name__ == "__main__":
    main()
