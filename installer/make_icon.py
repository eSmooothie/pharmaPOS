"""
Generate pharmapos.ico in the installer/ directory.
Run once before building:  python installer/make_icon.py
Requires Pillow (pip install Pillow).
"""

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "pharmapos.ico"

def make_icon() -> Image.Image:
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Indigo circle background
    margin = 8
    draw.ellipse([margin, margin, size - margin, size - margin], fill=(79, 70, 229, 255))

    # White pharmacy cross
    cx, cy = size // 2, size // 2
    arm_w, arm_h = size // 8, size * 5 // 12
    draw.rectangle([cx - arm_w // 2, cy - arm_h // 2, cx + arm_w // 2, cy + arm_h // 2], fill=(255, 255, 255, 255))
    draw.rectangle([cx - arm_h // 2, cy - arm_w // 2, cx + arm_h // 2, cy + arm_w // 2], fill=(255, 255, 255, 255))

    return img


if __name__ == "__main__":
    icon = make_icon()
    # Save multi-resolution ICO (16, 32, 48, 64, 128, 256)
    sizes = [icon.resize((s, s), Image.LANCZOS) for s in (16, 32, 48, 64, 128, 256)]
    sizes[0].save(OUT, format="ICO", sizes=[(s.width, s.height) for s in sizes],
                  append_images=sizes[1:])
    print(f"Icon written to {OUT}")
