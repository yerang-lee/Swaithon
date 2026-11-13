from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from voice.jangboso_voice.engine import VoiceService
from voice.jangboso_voice.schema import Command
from product_display import listing_display_name


class MemoryStore:
    def __init__(self):
        self.state = {'products': {}, 'commands': {}, 'events': []}

    @contextmanager
    def transaction(self):
        state = deepcopy(self.state)
        yield state
        self.state = state


class VoiceDefaultStockTest(unittest.TestCase):
    def test_new_registration_defaults_to_15_without_changing_sale_package(self):
        for explicit_stock, expected in ((None, 15), (24, 24), (0, 0)):
            with self.subTest(explicit_stock=explicit_stock):
                store = MemoryStore()
                parsed = Command(intent='PRODUCT_CREATE', product_name='귤', price=5000,
                                 sale_quantity=1, sale_unit='kg', category='FRUIT', stock_quantity=explicit_stock)
                parser = SimpleNamespace(parse=lambda messages: parsed)
                service = VoiceService(store, parser, clock=lambda: datetime(2026, 11, 12, tzinfo=timezone.utc))
                command = service.analyze('귤 1kg 5000원 등록해', '1', '1')
                self.assertEqual(command['status'], 'NEEDS_CONFIRMATION')
                self.assertEqual(command['preview']['after']['stock_quantity'], expected)
                self.assertEqual(store.state['products'], {})
                done = service.execute(command['command_id'], '1', '1', True, {'PRODUCT_CREATE'})
                result = done['result']
                self.assertEqual(result['stock_quantity'], expected)
                self.assertEqual(result['sale_quantity'], 1)
                self.assertEqual(result['sale_unit'], 'kg')
                self.assertEqual(listing_display_name(result['product_name'], SimpleNamespace(**result)), '귤 1kg')
                retry = service.execute(command['command_id'], '1', '1', True, {'PRODUCT_CREATE'})
                self.assertEqual(retry['result']['stock_quantity'], expected)
                self.assertEqual(len(store.state['products']), 1)

    def test_price_update_does_not_reset_existing_inventory_to_15(self):
        service = VoiceService(None, None)
        product = {'stock_quantity': 7, 'price': 5000, 'version': 1}
        updated = service._changed(product, {'intent': 'PRODUCT_UPDATE',
                    'parsed': Command(intent='PRODUCT_UPDATE', price=6000).model_dump()})
        self.assertEqual(updated['stock_quantity'], 7)
        self.assertEqual(updated['price'], 6000)


if __name__ == '__main__':
    unittest.main()
