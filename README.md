# BudgetWise PWA - Personal Budgeting System

This is a working **HTML + CSS + JavaScript PWA** for a personal budgeting system. It is compatible with phones and computers.

## Features

### 1. Dashboard
- Current balance
- Total income for Daily / Monthly / Yearly period
- Total deducted for Daily / Monthly / Yearly period
- Category budgeting overview
- Donut chart and budget progress bars

### 2. Categories
- Add category
- Edit category
- Update category
- Delete category if it is not used by a transaction
- Set category type:
  - **Add** = income / increases balance
  - **Deduct** = expense / decreases balance
- Set monthly budget limit

### 3. Transactions
- Add transaction
- Edit / update transaction
- Delete transaction
- Search transaction
- Transaction table
- Pagination
- Only **20 transactions per page** are shown

### 4. Settings
- Add Google Apps Script Web App URL
- Add security token
- Sync data to Google Sheets
- Auto-sync after adding, editing, updating, or deleting transactions/categories
- Load data from Google Sheets
- Export backup as JSON
- Import backup
- Toggle dark/light theme
- Reset local data

## How to open in VS Code

1. Extract the ZIP file first.
2. Open VS Code.
3. Go to **File > Open Folder**.
4. Select the extracted `budgetwise-pwa-working` folder.
5. Open `index.html`.
6. Right-click `index.html` and choose **Open with Live Server**.

Do not open the website directly inside the ZIP file.

## How the data works

By default, the app saves data in your browser using `localStorage`. This means it works even without Google Sheets.

To use Google Sheets as the database, use the included `Code.gs` file.

## Google Sheets setup

1. Create a new Google Sheet.
2. Click **Extensions > Apps Script**.
3. Delete any sample code.
4. Paste the full code from `Code.gs`.
5. Change this line:

```js
const SECURITY_TOKEN = 'change-this-password';
```

Example:

```js
const SECURITY_TOKEN = 'myBudget123';
```

6. Click **Deploy > New deployment**.
7. Select **Web app**.
8. Use these settings:
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
9. Click **Deploy**.
10. Copy the Web App URL ending in `/exec`.
11. Open the PWA website.
12. Go to **Settings**.
13. Paste the Web App URL.
14. Enter the same security token.
15. Keep **Automatically sync to Google Sheets after adding, editing, updating, or deleting data** checked.
16. Click **Save Settings**.
17. Click **Sync to Google Sheets** once to test the connection.
18. After that, new category and transaction changes will auto-sync.

The Apps Script will automatically create two sheets:

- `Categories`
- `Transactions`

## Important notes

- The website is fully usable without Google Sheets.
- Google Sheets sync needs internet connection. If you are offline, changes still save locally and sync can be done when you are back online.
- Auto-sync only works after you save a valid Apps Script Web App URL and matching security token in Settings.
- The PWA install button appears only after the app is hosted or opened through a proper local server.
- For testing, use VS Code Live Server.
- For real use, you can upload the files to GitHub Pages, Netlify, or any static hosting provider.

## Files included

- `index.html` - main website
- `styles.css` - responsive design
- `app.js` - app logic
- `manifest.webmanifest` - PWA manifest
- `service-worker.js` - offline support
- `Code.gs` - Google Sheets backend
- `icons/` - PWA icons


## Mobile navigation fix

This version changes the mobile bottom navigation to full width and flat on the bottom of the screen. It also adds a `touchend` handler plus the normal `click` handler, so page buttons work more reliably on phones.

After replacing files, refresh the browser with Ctrl + F5. If the installed PWA still shows the old floating menu, uninstall the old PWA from the phone and install it again so the updated service worker cache is used.
