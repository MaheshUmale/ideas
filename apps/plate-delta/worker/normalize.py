from decimal import Decimal, ROUND_HALF_UP


def normalized_unit_price(line_total_cents: int, quantity: str, units_per_pack: str) -> int:
    denominator = Decimal(quantity) * Decimal(units_per_pack)
    if denominator <= 0:
        raise ValueError("quantity and pack units must be positive")
    dollars_per_unit = (Decimal(line_total_cents) / Decimal(100)) / denominator
    return int((dollars_per_unit * Decimal(1_000_000)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def change_bps(previous: int, current: int) -> int:
    if previous <= 0:
        raise ValueError("previous price must be positive")
    return round((current - previous) * 10_000 / previous)
