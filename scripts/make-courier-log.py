"""Builds demo/evidence/fietskoerier-trial-week-log.pdf: the courier's evidence for the team demo.

A clearly marked, fictional document. It covers what a planner usually asks of the courier's
milestone: a written setup confirmation (pickup address, how and when to send the order list),
a test handover, and a log of the first service week with each customer's chosen slot.

    python scripts/make-courier-log.py
"""
import random
from datetime import date, timedelta

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = "demo/evidence/fietskoerier-trial-week-log.pdf"
BANNER = "DEMO DOCUMENT - fictional courier and bakery, created for the PayPal AI Hackathon demo"
PICKUP = "De Gouden Korst, Marktstraat 8, 1234 AB Demodorp (side door, counter at the back)"
LIST_TO = "rondes@fietskoerier-demodorp.example"
SLOTS = ["11:00-11:30", "11:30-12:00", "12:00-12:30", "12:30-13:00"]

CUSTOMERS = [
    "Bibliotheek Demodorp", "Makelaardij Haven", "Tandartspraktijk Wit", "Basisschool De Molen",
    "Uitzendbureau Snel", "Architecten Hof", "Fietsenmaker Ronde", "Notariskantoor Bos",
    "Studio Lijn", "Gemeente Demodorp", "Huisartsenpraktijk De Linde", "Bouwbedrijf Kok",
    "Reisbureau Zon", "IT-bedrijf Bitwerk", "Fysiotherapie Vliet", "Accountants Meijer",
]
STREETS = ["Schoolstraat", "Beukenhof", "Raadhuisplein", "Dorpsstraat", "Vlietweg", "Kanaalstraat",
           "Weverslaan", "Kerkstraat", "Molenweg", "Stationsplein", "Lindelaan", "Havenkade"]

# (day, orders on the list, list received)
DAYS = [
    (date(2026, 10, 23), 12, "10:21"),
    (date(2026, 10, 26), 8, "10:24"),
    (date(2026, 10, 27), 14, "10:18"),
    (date(2026, 10, 28), 11, "10:27"),
    (date(2026, 10, 29), 16, "10:15"),
]

rng = random.Random(23)


def hm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def day_label(d: date) -> str:
    return d.strftime("%a %d %b").replace(" 0", " ")


def distance(street: str, number: int) -> str:
    """The same address is always the same distance from the bakery: 0.4-1.9 km."""
    return f"{0.4 + (STREETS.index(street) * 7 + number) % 16 / 10:.1f} km"


def orders_for(d: date, count: int, first_no: int):
    """Orders sorted by chosen slot; each is delivered inside its own slot."""
    per_slot = [count // 4 + (1 if i < count % 4 else 0) for i in range(4)]
    pickup = 10 * 60 + rng.randint(50, 57)
    rows, no = [], first_no
    for s, n in enumerate(per_slot):
        start = 11 * 60 + 30 * s
        # Spread n deliveries over the slot, never on its last minute.
        times = sorted(rng.sample(range(start + 3, start + 29), n))
        for t in times:
            street, number = rng.choice(STREETS), rng.randint(2, 140)
            rows.append([
                str(no), rng.choice(CUSTOMERS), f"{street} {number}",
                distance(street, number), SLOTS[s], hm(pickup), hm(t), "yes",
            ])
            no += 1
    return rows


styles = getSampleStyleSheet()
body = styles["BodyText"]
small = styles["BodyText"].clone("small", fontSize=8.5, leading=11)
h1, h2 = styles["Title"], styles["Heading2"]


def table(rows, widths, header=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef9")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b8c2d6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def email(sender, to, when, subject, text):
    return [
        Paragraph(f"<b>From:</b> {sender}<br/><b>To:</b> {to}<br/><b>Date:</b> {when}<br/><b>Subject:</b> {subject}", small),
        Spacer(1, 3),
        Paragraph(text, body),
        Spacer(1, 8),
    ]


story = [
    Paragraph("Fietskoerier Demodorp", h1),
    Paragraph("Setup, test handover and first service week for Bakery De Gouden Korst (fictional)", body),
    Spacer(1, 10),
    Paragraph("1. Written setup confirmation", h2),
    *email(
        "planning@fietskoerier-demodorp.example", "Sanne, De Gouden Korst",
        "Wednesday 21 October 2026, 16:42", "Your account for lunch deliveries is set up",
        f"Dear Sanne, your bakery's account with us is set up and connected to our lunch round. "
        f"<b>Pickup address:</b> {PICKUP}. "
        f"<b>Order list:</b> one list per round, e-mailed to <b>{LIST_TO}</b> by <b>10:30</b>, built from the "
        "order notification e-mails your website sends (order number, customer, address, phone, items, chosen slot). "
        "Orders packed and labelled with the order number at the counter. "
        "We ride between 11:00 and 13:00, to addresses within 3 km (your delivery area is 2 km), on days with at "
        "least 10 orders; each order is delivered within the customer's chosen half-hour slot. On days with fewer "
        "than 10 orders there is no courier run and you arrange pickup or your own delivery. "
        "<b>Price:</b> the setup fee of EUR 50 covers the first service week; from week two onward the rate is "
        "<b>EUR 3.50 per delivered order</b>, invoiced weekly, on the same conditions (list by 10:30, 11:00-13:00, "
        "within 3 km, at least 10 orders per day). "
        "Your contact for the round: Jesse, 06-0000 0000 (demo). Kind regards, Jesse - Fietskoerier Demodorp",
    ),
    Paragraph("2. Test handover (Thursday 22 October 2026)", h2),
    Paragraph(
        "The order page went live on Thursday 22 October. That morning the bakery placed two test orders through the "
        "live order page and paid them with PayPal, then built the order list from the two order notification e-mails "
        f"and sent it to {LIST_TO} at 10:12.", body),
    Spacer(1, 4),
    table([
        ["Order", "Customer", "Address", "Distance", "Chosen slot", "Picked up", "Delivered", "In slot"],
        ["T1", "Test - Sanne (bakery)", "Kerkstraat 40", "0.7 km", "11:00-11:30", "10:58", "11:16", "yes"],
        ["T2", "Test - Jesse (courier)", "Lindelaan 12", "1.6 km", "11:30-12:00", "10:58", "11:41", "yes"],
    ], [14 * mm, 38 * mm, 30 * mm, 17 * mm, 22 * mm, 18 * mm, 18 * mm, 14 * mm]),
    Spacer(1, 6),
    *email(
        "planning@fietskoerier-demodorp.example", "Sanne, De Gouden Korst",
        "Thursday 22 October 2026, 12:05", "Test handover OK",
        f"Dear Sanne, we received your test list (2 orders, built from the website's order notifications) at 10:12, "
        f"before the 10:30 cutoff. We picked both orders up at {PICKUP.split(' (')[0]} at 10:58 and delivered them at "
        "11:16 and 11:41, each within its chosen slot. The handover works; the service starts tomorrow, Friday "
        "23 October. Kind regards, Jesse - Fietskoerier Demodorp",
    ),
]

summary = [["Day", "Orders on list", "List received", "Courier run", "Delivered in chosen slot"]]
logs, no, total = [], 1001, 0
for d, count, received in DAYS:
    if count < 10:
        summary.append([day_label(d), str(count), received, "no (below 10-order minimum)", "-"])
        logs += [Paragraph(f"<b>{day_label(d)}</b> - list received {received}, {count} orders: below the 10-order "
                           "minimum, no courier run. The bakery offered these customers pickup at the shop.", body),
                 Spacer(1, 8)]
        no += 10
        continue
    rows = orders_for(d, count, no)
    no += 20
    total += count
    summary.append([day_label(d), str(count), received, "yes", f"{count} of {count}"])
    logs += [
        Paragraph(f"<b>{day_label(d)}</b> - list received {received}, {count} orders, picked up {rows[0][5]}, "
                  f"round {rows[0][6]}-{rows[-1][6]}", body),
        Spacer(1, 3),
        table([["Order", "Customer", "Address", "Distance", "Chosen slot", "Picked up", "Delivered", "In slot"], *rows],
              [14 * mm, 42 * mm, 30 * mm, 16 * mm, 22 * mm, 17 * mm, 17 * mm, 13 * mm]),
        Spacer(1, 10),
    ]

story += [
    Paragraph("3. Summary of the first service week (Fri 23 - Thu 29 October 2026)", h2),
    table(summary, [26 * mm, 26 * mm, 26 * mm, 50 * mm, 42 * mm]),
    Spacer(1, 4),
    Paragraph(f"{total} orders delivered on four days with a courier run, all within 2 km and each within the "
              "customer's chosen slot between 11:00 and 13:00. Every list arrived before 10:30.", body),
    Spacer(1, 6),
    Paragraph("4. Delivery log per day (date, order, chosen slot, pickup time, delivery time)", h2),
    Paragraph("Sent by Fietskoerier Demodorp (planning@fietskoerier-demodorp.example) to Sanne, De Gouden Korst, "
              "on Thursday 29 October 2026 at 14:30, after the last round of the week.", body),
    Spacer(1, 6),
    *logs,
]


def banner(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(colors.HexColor("#b00020"))
    canvas.drawString(15 * mm, A4[1] - 10 * mm, BANNER)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.grey)
    canvas.drawString(15 * mm, 10 * mm, f"Fietskoerier Demodorp - setup and first week log - De Gouden Korst - page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                        title="Fietskoerier Demodorp - setup and first week log (demo)", author="Milestone Escrow demo")
doc.build(story, onFirstPage=banner, onLaterPages=banner)
print(f"wrote {OUT}")
