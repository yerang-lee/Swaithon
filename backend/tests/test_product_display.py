from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from product_display import listing_display_name


class ProductDisplayTest(unittest.TestCase):
    def test_package_is_preserved_without_duplicate_or_integer_decimal(self):
        self.assertEqual(listing_display_name('사과', SimpleNamespace(sale_quantity=5., sale_unit='개')), '사과 5개')
        self.assertEqual(listing_display_name('사과', SimpleNamespace(sale_quantity=.5, sale_unit='kg')), '사과 0.5kg')
        self.assertEqual(listing_display_name('사과 5개', SimpleNamespace(sale_quantity=5., sale_unit='개')), '사과 5개')
        self.assertEqual(listing_display_name('사과', SimpleNamespace(sale_quantity=None, sale_unit=None)), '사과')


if __name__ == '__main__':
    unittest.main()
