from pathlib import Path
import sys
import tempfile
import unittest

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[1]))
from market_assets import MARKET_ASSET_DIR, mount_market_images, market_photo_path


class MarketImagesTest(unittest.TestCase):
    def test_manri_uses_its_own_photo(self):
        default = "/uploads/markets/default-market.jpg"
        self.assertEqual(market_photo_path("만리시장", None), "/uploads/markets/manri.jpg")
        self.assertEqual(market_photo_path("만리시장", default), "/uploads/markets/manri.jpg")
        self.assertEqual(market_photo_path("마포시장", default), default)
        self.assertEqual(market_photo_path("만리시장", "/uploads/custom.jpg"), "/uploads/custom.jpg")

    def test_clean_deployment_serves_market_photos_and_credits(self):
        with tempfile.TemporaryDirectory() as directory:
            app = FastAPI()
            mount_market_images(app, directory)
            app.mount("/uploads", StaticFiles(directory=directory), name="uploads")
            with TestClient(app) as client:
                for photo in MARKET_ASSET_DIR.glob("*.jpg"):
                    with self.subTest(photo=photo.name):
                        response = client.get(f"/uploads/markets/{photo.name}")
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.headers["content-type"], "image/jpeg")
                        self.assertTrue(response.content.startswith(b"\xff\xd8\xff"))
                self.assertEqual(client.get("/uploads/markets/credits.html").status_code, 200)
                self.assertEqual(client.get("/uploads/markets/missing.jpg").status_code, 404)

    def test_uploaded_market_photo_takes_priority(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "markets"
            target.mkdir()
            content = (MARKET_ASSET_DIR / "gongdeok.jpg").read_bytes()
            (target / "default-market.jpg").write_bytes(content)
            app = FastAPI()
            mount_market_images(app, directory)
            with TestClient(app) as client:
                self.assertEqual(client.get("/uploads/markets/default-market.jpg").content, content)
                self.assertEqual(client.get("/uploads/markets/tongin.jpg").status_code, 200)


if __name__ == "__main__":
    unittest.main()
