import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from ai.recommendation_rules import recommend_from_payload
from ai.recommendation_personalization import personalize_recommendations
from ai.recommendation_runtime import MODEL_DIR, predict_demo
from ai.recommendation_ai import AIRecommender


def shopping_payload():
    return {
        'request_id': 'apple-meat-test', 'as_of': '2026-11-12T12:00:00+09:00',
        'user': {'user_id': '1', 'interest_product_ids': ['1'], 'events': [
            {'event_id': 'apple', 'product_id': '1', 'store_id': '1', 'event_type': 'favorite',
             'occurred_at': '2026-11-12T10:00:00+09:00'},
            {'event_id': 'meat', 'product_id': '2', 'store_id': '2', 'event_type': 'purchase_confirmed',
             'occurred_at': '2026-11-12T11:00:00+09:00'},
        ]},
        'products': [{'product_id': str(i), 'category_id': str(i)} for i in (1, 2, 3)],
        'listings': [{'listing_id': str(i), 'product_id': str(i if i < 3 else 3),
                      'category_id': str(i if i < 3 else 3), 'name': 'apple' if i == 1 else 'meat' if i == 2 else 'other',
                      'store_id': str(i), 'distance_km': 3 if i < 3 else .1,
                      'created_at': '2026-11-11T00:00:00+09:00'} for i in range(1, 35)],
    }


class PersonalizationTest(unittest.TestCase):
    def test_apple_and_picked_up_meat_are_present_at_front_of_rule_and_ai(self):
        payload = shopping_payload()
        rule = recommend_from_payload(payload, top_n=None)
        results = [personalize_recommendations(rule, payload),
                   predict_demo(payload, AIRecommender(MODEL_DIR / 'recommendation_model.joblib'))]
        for result in results:
            self.assertIsNotNone(result)
            self.assertEqual({item['listing_id'] for item in result['items'][:2]}, {'1', '2'})
            self.assertEqual(len(result['items']), 20)
            self.assertEqual([item['rank'] for item in result['items']], list(range(1, 21)))
            self.assertEqual([item['score'] for item in result['items']], sorted(
                (item['score'] for item in result['items']), reverse=True))
            self.assertTrue(all('ranking_base_score' in item['feature_snapshot'] for item in result['items']))

    def test_no_interest_preserves_original_order_and_unavailable_items_are_not_invented(self):
        payload = shopping_payload()
        payload['user'].update(interest_product_ids=[], events=[])
        rule = recommend_from_payload(payload, top_n=None)
        self.assertEqual(personalize_recommendations(rule, payload)['items'], rule['items'][:20])
        payload = shopping_payload()
        payload['listings'] = [row for row in payload['listings'] if row['listing_id'] != '2']
        result = personalize_recommendations(recommend_from_payload(payload, top_n=None), payload)
        self.assertEqual(result['items'][0]['listing_id'], '1')
        self.assertNotIn('2', {item['listing_id'] for item in result['items']})


if __name__ == '__main__':
    unittest.main()
