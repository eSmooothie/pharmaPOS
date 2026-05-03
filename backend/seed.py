"""Seed initial reference data. Safe to run multiple times (skips existing rows)."""
from database import SessionLocal
from models import DiscountType, DrugClass, GroceryCategory


DRUG_CLASSES = [
    # Pain & Fever
    "Analgesics & Antipyretics",
    # Infection
    "Antibiotics",
    "Antifungals",
    "Antivirals",
    "Antiparasitics & Anthelmintics",
    # Cardiovascular & Metabolic
    "Antihypertensives",
    "Antidiabetics",
    "Cardiovascular",
    "Anticoagulants & Antithrombotics",
    "Diuretics",
    "Lipid-Lowering Agents",
    # Nutrition
    "Vitamins & Supplements",
    "Minerals & Electrolytes",
    # Allergy & Respiratory
    "Antihistamines",
    "Cough & Cold",
    "Bronchodilators & Respiratory",
    # Gastrointestinal
    "Antacids & GI",
    "Antidiarrheals",
    "Laxatives",
    "Antiemetics",
    # Skin, Eyes & ENT
    "Dermatologicals",
    "Ophthalmic",
    "Otic",
    # Hormones & Endocrine
    "Hormones & Endocrine",
    "Thyroid Medications",
    "Corticosteroids",
    "Contraceptives",
    # Nervous System
    "Neurological",
    "Anxiolytics & Sedatives",
    "Antidepressants",
    "Antipsychotics",
    "Muscle Relaxants",
    # Other Systems
    "Urological",
    "Dental & Oral Health",
    "Wound Care & Antiseptics",
    "Vaccines & Biologicals",
    "Immunosuppressants",
    "Oncology",
    "Others",
]

GROCERY_CATEGORIES = [
    # Food
    "Snacks",
    "Biscuits & Crackers",
    "Sweets & Candy",
    "Bread & Bakery",
    "Instant Noodles & Pasta",
    "Rice & Grains",
    "Canned Goods",
    "Condiments & Sauces",
    "Spices & Seasonings",
    "Cooking Oil & Vinegar",
    "Dairy & Eggs",
    "Frozen Foods",
    # Drinks
    "Beverages",
    "Coffee & Tea",
    "Juices & Energy Drinks",
    "Water & Softdrinks",
    # Personal & Home
    "Personal Care",
    "Oral Care",
    "Feminine Hygiene",
    "Baby Products",
    "Household Supplies",
    "Detergents & Fabric Care",
    "Paper Products",
    # Health & Safety
    "Medical & First Aid Supplies",
    "Alcohol & Sanitizers",
    # Others
    "Pet Supplies",
    "School & Office Supplies",
    "Others",
]

DISCOUNT_TYPES = [
    {"name": "Senior Citizen", "percent": 20.0, "is_vat_exempt": True},
    {"name": "PWD",            "percent": 20.0, "is_vat_exempt": True},
]


def seed():
    db = SessionLocal()
    try:
        existing_dc = {r.name for r in db.query(DrugClass).all()}
        for name in DRUG_CLASSES:
            if name not in existing_dc:
                db.add(DrugClass(name=name))

        existing_gc = {r.name for r in db.query(GroceryCategory).all()}
        for name in GROCERY_CATEGORIES:
            if name not in existing_gc:
                db.add(GroceryCategory(name=name))

        existing_dt = {r.name for r in db.query(DiscountType).all()}
        for dt in DISCOUNT_TYPES:
            if dt["name"] not in existing_dt:
                db.add(DiscountType(**dt))

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("Seed data loaded.")
