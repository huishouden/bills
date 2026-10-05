# Huishouden Bills

What's due, and when: the household's bills for the next 30 days, with the ones that need a hand
called out.

Live at https://huishouden-piekstra.web.app/bills/; the old address, huishouden-bills.web.app, redirects there. It is also linked from the [Huishouden portal](https://huishouden-piekstra.web.app).

## Screenshots

| Upcoming | Find bills in my email |
|---|---|
| ![Overdue, this week and later this month, with autopay state and amounts](docs/screenshots/upcoming.png) | ![Senders of statement emails proposed as bill sources](docs/screenshots/find-bills.png) |

| Possible regular bills | |
|---|---|
| ![Regular card charges offered as bills, with Add and Not a bill](docs/screenshots/suggested-bills.png) | |

| Reminders | Rent: who to pay and how |
|---|---|
| ![A prompt to turn on notifications because Rent has reminders](docs/screenshots/phone-reminders.png) | ![Rent's row: Zelle to Example Rentals, with a copy button and a bell](docs/screenshots/phone-rent-row.png) |

| A bill opened from its notification | A bill's payee, way to pay and reminders |
|---|---|
| ![Rent with how to pay, the landlord's phone and email, its reminders and Mark paid](docs/screenshots/phone-bill.png) | ![Edit bill: Zelle, payment details, who pays, reminders 3 days before and on the due day](docs/screenshots/phone-bill-reminders.png) |

| Bills settings | How to pay, filled in from the payee |
|---|---|
| ![Notifications on this device, mute for me, and the household's reminder default](docs/screenshots/phone-settings.png) | ![Add a bill: Pay to Example Rentals, Zelle, their saved Zelle email filled in, their phone one tap away](docs/screenshots/phone-pay-prefill.png) |

| History | Phone |
|---|---|
| ![Paid, autopaid and replaced bills](docs/screenshots/history.png) | ![Upcoming on a phone](docs/screenshots/phone-upcoming.png) |

_These are screenshots of the live site while signed out. Signed out, it shows an invented household dated in 2031. CI refreshes them after each deploy._

## Paying and reminders

Each bill (or, for email bills, its bill source) can say how it is paid:

- **Pay to**: one of the household's contacts, from any app (the landlord added in Home), or a new
  one. Its phone and email show on the bill, each with a copy button.
- **How to pay**: Zelle, Venmo, bank transfer, check, cash, card or the online portal (the pay
  link), with payment details such as the Zelle email, shown with a copy button. The row reads
  "Zelle to Example Rentals"; a portal bill has Open in its row.
- **Details filled in from the payee**: whichever is chosen first, the payee or the way to pay,
  the details fill in with what was saved on the contact before, else their only phone or email
  for Zelle (their phone for Venmo, their address for a check, their https website for a portal),
  with their other details as "Use …" chips. Choosing another payee replaces only what was filled
  in, never typed text. The first details saved for a contact and way to pay are remembered on
  the contact ("Saved on Example Rentals"), shown and editable in its contact dialog under "How to
  pay them", so the next bill to them fills in by itself. A Venmo username gets its @.
- **Who pays**: one admin or member, or anyone.

A repeating bill's next one keeps all of this. The portal's To-do list and the household agenda
say "Pay Example Rentals by Zelle"; both stay private to admins and members.

Reminders are off unless someone turns them on:

- **Household default** (Bills settings): none (the default), unpaid bills paid by hand (autopay
  off), or all unpaid bills. Bills on autopay never remind by default.
- **Per bill**: the household default, off, or on, with up to 4 days before the due date (7, 3,
  1, the day itself) and the day after if still unpaid. An autopay bill turned on reminds before
  its draft date and never as overdue.
- Reminders go out at 9:00 in the household's time zone (saved with the settings) through the
  suite's notification sender (huishouden/notify): to the member who pays the bill, or else to
  every admin and member. Helpers and kids never get them.
- **Mark paid** is an outlined button named for the bill. A bill marked paid here stays in its
  group for six hours, after the ones still to pay: a check, its name muted, "Paid by you ·
  10:30 AM" and a small **Undo** (which also takes back a repeating bill's untouched next one). A
  group whose bills are all paid folds to "All paid". Paid bills are always in History.
- Tapping a reminder opens the bill, with **Mark paid**. Paying, skipping or removing a bill in
  Bills cancels its pending reminders. One paid or skipped anywhere else (the portal's To-do
  list, the connector, a calendar) has its reminders dropped unsent by the sender, which reads
  the bill named in each reminder's `source` field before sending it; Bills tidies them up the
  next time it opens.
- **Notifications on this device** in Bills settings turns them on per phone or tablet. The
  first time a bill has reminders, Upcoming offers it too. **Mute bill reminders for me** stops
  them for one member on all their devices, without changing the household's setting.

## How email checks work

1. A member taps **Find bills in my email**. Bills searches the last 60 days of their Gmail for
   statement wording ("statement is ready", "amount due", "payment due", "autopay", and similar).
   It groups the results by sender. The member names each sender that is a bill, sets its kind and
   adds it as a **bill source**. A source can also be added by hand, by sender address or domain,
   subject words, or Gmail label.
2. **Check email** runs one Gmail search per source (`from:(…) subject:(…) label:… newer_than:60d`)
   and reads up to 8 matching messages per source. Each message is parsed in the browser for:
   - the amount due
   - the due date
   - autopay wording, such as "will be automatically drafted on…", "You are enrolled in AutoPay"
     or "not enrolled"
   - the statement period
3. Each statement becomes one bill at `bills/{sourceId}_{dueDate}`, so reading it again rewrites
   the same document. Only bills whose content changed are written. A payment-confirmation email
   that arrives after a statement marks that statement paid.
4. A member's **Paid**, **Skip** and **Remove** are kept through later checks.
5. Google asks for Gmail access once, in a popup opened by a tap. Google shows an "unverified app"
   warning because the read-only Gmail scope is restricted. The access token lasts an hour. While
   it is valid, opening the app checks again on its own. After that, a check waits for a tap.
   Nothing opens a popup by itself.

The parser knows wording, not providers: no provider names or sender addresses are in the code.
Which senders are bills is household data in Firestore.

### Parser limits

- It reads dollar amounts (`$`) only.
- A due date is taken from the text next to a due-date label, or from the autopay draft date when
  there is no label. Bills that state only "due in 21 days" get no date.
- An email that offers autopay ("Sign up for AutoPay") does not count as enrolled. When the
  emails never say, the source's own autopay setting decides. Otherwise autopay shows as unknown,
  which counts as not covered.
- Statements that exist only as a PDF attachment, or behind a "view your bill" link with no figures
  in the email, give the source's name and date but no amount. Add the amount by hand, or let the
  bill show "—".
- It reads the latest 8 messages per source within 60 days.

## Bills found in card spending

Bills also reads the household's card spending from Huishouden Spending (the last 400 days) and
looks for regular charges with `@huishouden/pwa-kit/recurring`:

- A charge counts when it comes back weekly, monthly or quarterly at least 3 times, or yearly twice
  (365 ± 10 days apart), on a steady schedule.
- The amount must stay within 10%. Utilities and insurance may vary.
- Refunds, credits and card payments are left out. So are groceries, dining and fuel, unless the
  same amount comes on time every time. A charge that has stopped coming drops out.

Up to 5 new ones show in a **Possible regular bills** card under Upcoming. A charge is not offered
when a bill or bill source with the same merchant name already exists (bills also need a similar
amount). **Add** makes a repeating bill: same name, amount and cadence, due when the next charge is
expected, autopay by card. **Not a bill** hides it for the whole household. Both have Undo. When a
repeating bill on autopay passes its due date, the next one is added when someone next opens the
app.

The line under the headline, "Subscriptions: $X/month across N", adds up the subscriptions found
in card spending at their monthly cost. It includes the ones already added and leaves out the ones
marked Not a bill.

## Data

Signed-in members of a Huishouden household read and write these documents under
`households/{householdId}`:

- `billSources/{id}`: name, kind, `from`/`subject`/`label` match, pay link, autopay when the emails
  are silent.
- `bills/{id}` (`bill/v1`): kind, label, due, `amountDue` `{amount, currency}`, `status`
  (`due`/`paid`/`credit`/`unknown`), `autopay` `{enrolled, nextDraft?, via?: 'card'}`, `repeat` (weekly, monthly, quarterly, yearly) for bills added by hand, statement period, how it
  was paid, and `dismissed`. `dismissed` on an unpaid bill means it was skipped: **Skip** on
  Upcoming or on the portal's To-do list. It shows in History as skipped, where it can be put back.
  Skipping a repeating bill added by hand adds the next one, as paying it does. On a paid,
  autopaid or replaced email bill, `dismissed` means it was removed, and it is hidden.
- `billSuggestions/{merchant}`: a member's answer to a suggested bill, `added` (with the bill's id)
  or `dismissed`, with the name, who and when.
- `spendingTransactions` (Huishouden Spending's, read only): date, description, amount, category
  and type, for suggested bills.
- `billSync/{memberEmail}`: when that member last checked, with counts and per-source errors.
- `agenda/{id}` (app `bills`): each unpaid bill with a due date, as an all-day `bill` item on that
  date for the household agenda the portal shows. Title is the bill's name; detail is the amount and
  autopay state ("$84.20, autopay off"); status is `overdue` or `upcoming`, and absent for bills on
  autopay. Written when a bill is saved, paid, removed or read from email, and reconciled each time
  the app opens. Paid, credited, autopaid and replaced bills leave it.
- `todos/{id}` (app `bills`, ref `bill:{id}`, always private): each bill someone has to pay, for the
  portal's To-do list. These are the unpaid, unskipped bills without autopay that are due within 30
  days or have no due date. Title is the bill's name, detail the amount. `createdAt` is when the
  bill was added and `due` its due day. The portal's **Mark paid** writes what Bills' **Mark paid** does: `status: 'paid'`,
  `paidAt`, `paidBy` and `paidVia: 'member'`. **Skip** sets `dismissed`. Both add a repeating
  bill's next one under the id the app uses (`{id}~{due}`), and only admins and members can run
  them. Written when the app opens and after every change to the bills made in it.

The project's Firestore rules live in `huishouden/rules`.
Nothing from a mailbox is stored except these parsed fields and the Gmail message id. The message
id lets the member who checked open the email.

## Privacy

Household data lives in the household's own Firestore documents, visible only to its members.
To catch problems early, the app sends reports to New Relic (free tier) through
`@huishouden/pwa-kit/observability`: errors (emails, ids, query strings and long numbers removed),
Core Web Vitals and page loads, the app version, device type, and the country and region New Relic
derives from the request; and anonymous usage counts per visit: `check email`, `mark bill paid`, `add bill`, `save bill source`, `add suggested bill`, `dismiss suggested bill`, and which tab is open. Households are counted by a
hash of the id. No names, emails, entries, free text or precise location, and no cookie or stored
id: nothing links one visit to the next. When the browser sends Global Privacy Control or Do Not
Track, usage counts are skipped; errors and speed still go. Local builds, staging and automated
browsers send nothing. The page people see is
[huishouden-piekstra.web.app/privacy](https://huishouden-piekstra.web.app/privacy); details in pwa-kit
[docs/observability.md](https://github.com/huishouden/pwa-kit/blob/main/docs/observability.md).

## Develop

```sh
bun install          # also enables the pre-commit leak scan
bun run env:pull     # writes .env.local from the repo's VITE_* variables
bun run dev          # http://localhost:3004
bun run lint && bun run test && bunx pwa-design-check && bun run build
bun run e2e          # smoke, sample-data flows and stubbed-Gmail tests against the live site (BASE_URL to override)
bun run screenshots  # README screenshots (SCREENSHOT_DIR to override)
```

The parser's sample emails are invented: they use example.com and dates in 2031. They are in
`src/lib/__fixtures__/emails/`, and adding a case means adding a file there. Browser tests stand in
for Gmail by setting `window.__gmailTestToken` and answering `gmail.googleapis.com` with
`page.route`.

Bills is built on [huishouden-pwa-kit](https://github.com/huishouden/pwa-kit) and follows its
[design language](https://github.com/huishouden/pwa-kit/blob/main/DESIGN.md) and
[standard](https://github.com/huishouden/pwa-kit/blob/main/STANDARD.md). Pushes to `main` upload the hashed build files to the suite's asset CDN (the
Cloudflare Worker `huishouden-assets`, with the repo secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`; the variable `HH_ASSET_CDN=off` turns it off) and deploy the pages to
Firebase Hosting (site `huishouden-bills`), then run the smoke tests and refresh the screenshots.

## License

Source available under [PolyForm Shield 1.0.0](LICENSE): you may use, study and modify this code
for any purpose except providing a product that competes with Huishouden.

Huishouden and its logo are the project's brand; please don't use them for other products.
