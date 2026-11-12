"""Serve versioned market photos even on deployments without uploaded files."""

from pathlib import Path

from fastapi.staticfiles import StaticFiles

MARKET_ASSET_DIR = Path(__file__).resolve().parent / "static" / "markets"


def market_photo_path(market_name, image):
    if market_name.replace(" ", "") == "만리시장" and (
        not image or image == "/uploads/markets/default-market.jpg"
    ):
        return "/uploads/markets/manri.jpg"
    return image


def mount_market_images(app, upload_dir):
    images = StaticFiles(directory=MARKET_ASSET_DIR)
    # Preserve uploaded market images, falling back to repository assets.
    images.all_directories.insert(0, str(Path(upload_dir) / "markets"))
    # Register before the broader /uploads mount so these URLs reach this app.
    app.mount("/uploads/markets", images, name="market-images")
