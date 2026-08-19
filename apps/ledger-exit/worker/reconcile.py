from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Entry:
    external_id: str
    account: str
    date: str
    debit: Decimal
    credit: Decimal


def signature(e: Entry):
    return (e.account, e.date, e.debit.quantize(Decimal(".01")), e.credit.quantize(Decimal(".01")))


def reconcile(source: list[Entry], destination: list[Entry]):
    def aggregate(rows):
        out = {}
        for r in rows:
            out[r.account] = out.get(r.account, Decimal(0)) + r.debit - r.credit
        return out

    sa, da = aggregate(source), aggregate(destination)
    accounts = sorted(set(sa) | set(da))
    balances = [
        {"account": a, "source": sa.get(a, 0), "destination": da.get(a, 0), "delta": sa.get(a, 0) - da.get(a, 0)}
        for a in accounts
    ]
    return {"balances": balances, "balanced": all(x["delta"] == 0 for x in balances)}
