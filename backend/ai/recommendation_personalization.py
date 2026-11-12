"""Serve explicit preferences even when a demo model ignores those features."""
from .recommendation_rules import build_recommendation_inputs, get_user_recommendation_profile

POLICY_VERSION = 'explicit_preferences_v1'


def personalize_recommendations(result, payload, top_n=20):
    user, _, as_of = build_recommendation_inputs(payload)
    profile = get_user_recommendation_profile(user, now=as_of)
    preferred = profile['interest_product_ids']
    categories = {user['product_categories'][product_id] for product_id in preferred
                  if product_id in user['product_categories']}
    items = result['items']
    if not categories or not items:
        return {**result, 'items': items[:top_n]}
    listing_categories = {str(row['listing_id']): str(row['category_id']) for row in payload['listings']}
    scores = [float(item['score']) for item in items]
    lowest, span = min(scores), max(scores) - min(scores) + 1
    ranked = []
    representatives = {}
    for item in items:
        snapshot = dict(item['feature_snapshot'])
        category = listing_categories[str(item['listing_id'])]
        category_match = category in categories
        score = ((float(item['score']) - lowest) / span) * .1
        score += float(snapshot['interest_match']) * 2
        score += float(snapshot['category_preference']) * .5
        score += int(category_match)
        snapshot['ranking_base_score'] = float(item['score'])
        snapshot['ranking_policy_version'] = POLICY_VERSION
        row = {**item, 'score': score, 'feature_snapshot': snapshot}
        ranked.append(row)
        # Reserve an early representative for every preferred category present
        # in eligible candidates, so one category cannot crowd out another.
        if category_match and (category not in representatives or score > representatives[category]['score']):
            representatives[category] = row
    for row in representatives.values():
        row['score'] += 5
    ranked.sort(key=lambda item: (-item['score'], str(item['listing_id'])))
    for rank, item in enumerate(ranked, 1):
        item['rank'] = rank
        item['feature_snapshot']['score'] = item['score']
        item['feature_snapshot']['rank'] = rank
    return {**result, 'items': ranked[:top_n]}
