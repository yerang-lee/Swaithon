from copy import deepcopy
import unittest

from backend.voice.jangboso_voice.result_identity import attach_result_product_ids


class ResultIdentityTest(unittest.TestCase):
    def state(self):
        return {
            "products": {"42": {"listing_id": "42", "product_id": 7, "price": 9000}},
            "commands": {"cmd": {
                "status": "SUCCEEDED", "listing_id": "42",
                "result": {"listing_id": "42", "price": 5000},
            }},
        }

    def test_saved_result_and_legacy_retry_receive_product_id(self):
        state = self.state()
        old_result = state["commands"]["cmd"]["result"]
        attach_result_product_ids(state)
        result = state["commands"]["cmd"]["result"]
        self.assertEqual(result, {"listing_id": "42", "product_id": 7, "price": 5000})
        self.assertNotIn("product_id", old_result)
        retry = deepcopy(state)
        attach_result_product_ids(retry)
        self.assertEqual(retry, state)

    def test_does_not_guess_from_listing_or_other_command(self):
        for change in (
            {"status": "NEEDS_CONFIRMATION"},
            {"listing_id": "99"},
            {"result": None},
            {"result": {"listing_id": "99"}},
        ):
            with self.subTest(change=change):
                state = self.state()
                state["commands"]["cmd"].update(change)
                before = deepcopy(state)
                attach_result_product_ids(state)
                self.assertEqual(state, before)

    def test_missing_or_invalid_product_id_is_not_replaced_by_listing_id(self):
        for product_id in (None, "7", 0, -1, True):
            with self.subTest(product_id=product_id):
                state = self.state()
                state["products"]["42"]["product_id"] = product_id
                attach_result_product_ids(state)
                self.assertNotIn("product_id", state["commands"]["cmd"]["result"])


if __name__ == "__main__":
    unittest.main()
