# UGC Creator Email Tool

Internal MVP for creator outreach, workflow tracking, template previews, and email history.

## Run

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`.

## Warren Email Setup

Copy `.env.example` to `.env.local`, then fill in the Warren mailbox settings:

```bash
cp .env.example .env.local
```

For Google Workspace / Gmail, the defaults are usually:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
```

Use the Warren email address as `SMTP_USER` and `IMAP_USER`.

For Gmail/Google Workspace, you normally need either an app password or admin-approved mailbox access. If the account uses normal 2FA, create an app password for this tool and use that as `SMTP_PASS` and `IMAP_PASS`.

Restart the dev server after changing `.env.local`.

## How Real Email Works

- Sending uses SMTP through `lib/emailProvider.js`.
- Incoming replies are pulled from unread IMAP inbox messages when you press `Sync Inbox`.
- Outbound subjects include `[UGC-id]` so replies can be matched back to the creator.
- If the tag is missing, the inbox sync falls back to matching the sender email against creator email.
- Matched replies are saved to `message_history`, marked as seen, and processed through intent detection.
- Unmatched unread messages are left unread.

## Creator CSV Sync

The creator dashboard syncs with:

```bash
/Users/keremyilmaz/Downloads/UGC tracking - Creator Contact List.csv
```

Override it with `UGC_CREATORS_CSV_PATH` in `.env.local` if the file moves.

- Opening the creators dashboard imports CSV changes first.
- Creating, editing, deleting, emailing, or syncing replies in the tool writes creator fields back to the CSV.
- Existing CSV columns are preserved. The tool adds mapped columns such as `Tool ID`, `Workflow Stage`, `Next Action`, and status fields.
- Rows are matched by `Tool ID` when available, then by email/contact.

## Validation

```bash
npm run validate
npm run build
npm audit --omit=dev
```
