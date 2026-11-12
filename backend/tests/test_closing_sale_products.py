"""Verify closing-sale filters against the actual product-list ORM query."""
import unittest

from test_withdrawn_store_visibility import WithdrawnStoreVisibilityTest
import models


class ClosingSaleProductsTest(WithdrawnStoreVisibilityTest):
    def test_filters_and_pagination(self):
        for listing_id, sale_price, sold_out in (
            (1, 800, False), (2, None, False), (3, 800, True),
            (4, 1000, False), (5, 1200, False), (6, 0, False),
        ):
            listing = self.db.get(models.Listing, listing_id)
            if listing is None:
                listing = models.Listing(
                    listing_id=listing_id, product_id=1, store_id=1, price=1000,
                )
                self.db.add(listing)
            listing.sale_price = sale_price
            listing.is_sold_out = sold_out
        self.db.commit()
        get_products = self.product_routes['get_products']

        def fetch(**filters):
            return get_products(market_id=1, page=1, size=10, db=self.db, **filters)

        self.assertEqual(fetch().total_count, 6)
        sale = fetch(is_on_sale=True, is_sold_out=False)
        self.assertEqual(sale.total_count, 2)
        self.assertEqual({p.listing_id for p in sale.products}, {1, 6})
        self.assertTrue(all(p.is_on_sale and not p.is_sold_out for p in sale.products))
        self.assertEqual(
            {p.listing_id for p in fetch(is_on_sale=False).products}, {2, 4, 5},
        )
        self.assertEqual(
            [p.listing_id for p in fetch(is_on_sale=True, is_sold_out=True).products], [3],
        )
        pages = [get_products(
            market_id=1, page=page, size=1, db=self.db,
            is_on_sale=True, is_sold_out=False,
        ) for page in (1, 2, 3)]
        self.assertEqual([p.total_count for p in pages], [2, 2, 2])
        self.assertEqual({p.listing_id for page in pages for p in page.products}, {1, 6})
        self.assertEqual(pages[2].products, [])


if __name__ == '__main__':
    unittest.main()
