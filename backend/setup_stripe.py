"""Idempotent Stripe catalog setup for OmniLocal #1 (Flow A claimable sandbox)."""
import os

import stripe
from dotenv import load_dotenv

load_dotenv()
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = [
    {
        "emergent_product_id": "omnilocal_pro",
        "name": "OmniLocal #1",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "omnilocal_monthly", "amount": 9700, "currency": "usd", "interval": "month"},
            {"lookup_key": "omnilocal_yearly", "amount": 97000, "currency": "usd", "interval": "year"},
        ],
    },
]


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(name=entry["name"], tax_code=entry.get("tax_code"),
                                 metadata={"managed_by": "emergent",
                                           "emergent_product_id": entry["emergent_product_id"]})


def main():
    country = stripe.Account.retrieve()["country"]
    print(f"Sandbox country: {country}")
    for entry in CATALOG:
        product = get_or_create_product(entry)
        print(f"Product: {product.name} ({product.id})")
        for p in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                kwargs = dict(product=product.id, unit_amount=p["amount"], currency=p["currency"],
                              lookup_key=p["lookup_key"], transfer_lookup_key=True)
                if p.get("interval"):
                    kwargs["recurring"] = {"interval": p["interval"]}
                price = stripe.Price.create(**kwargs)
                print(f"  Created price {p['lookup_key']}: {price.id}")
            else:
                print(f"  Price {p['lookup_key']} exists: {existing[0].id}")


if __name__ == "__main__":
    main()
