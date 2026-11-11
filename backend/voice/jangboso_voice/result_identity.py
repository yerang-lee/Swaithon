"""Attach database product identities without replacing historical result values."""


def attach_result_product_ids(state):
    products = state["products"]
    for command in state["commands"].values():
        result = command.get("result")
        if command.get("status") != "SUCCEEDED" or not isinstance(result, dict):
            continue
        listing_id = command.get("listing_id")
        if listing_id is None or str(result.get("listing_id")) != str(listing_id):
            continue
        product = products.get(str(listing_id))
        if not product:
            continue
        product_id = product.get("product_id")
        if type(product_id) is int and product_id > 0:
            # Assign a new JSON object so ORM persistence detects legacy repairs too.
            command["result"] = {**result, "product_id": product_id}
