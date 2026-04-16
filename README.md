# 麻醉績效管理系統

A GitHub Pages + GitHub API web application for managing anesthesia performance points.

## Setup

### 1. Fork or create this repository on GitHub

Make the repository **public** (required for GitHub Pages) or use a private repo with a token.

### 2. Enable GitHub Pages

Go to **Settings → Pages → Source → GitHub Actions** and save.

### 3. Push to trigger deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` will automatically deploy on every push to `main`.

### 4. First-time app configuration

Open the deployed URL (`https://<owner>.github.io/<repo>/`) and fill in the setup modal:

| Field | Value |
|-------|-------|
| GitHub Username | Your GitHub username or org |
| Repository Name | This repo's name |
| Branch | `main` |
| Personal Access Token | A PAT with `repo` scope (for write operations) |

Create a PAT at: https://github.com/settings/tokens

### 5. Import existing data (optional)

If you have Excel data, run the import script:

```bash
cd scripts
pip install openpyxl
python import_excel.py
```

Then commit and push the generated `data/cases/*.json` files.

## Architecture

- **Frontend**: Single-page app (HTML + CSS + vanilla JS)
- **Storage**: JSON files in this repo, read/written via GitHub REST API
- **Hosting**: GitHub Pages (free static hosting)
- **Auth**: GitHub Personal Access Token stored in browser localStorage

## Data Files

- `data/cases/YYYY-MM.json` — monthly case records
- `data/point_settings.json` — point calculation periods
- `data/config.json` — app config

## Features

- Dashboard with KPI cards and charts
- Add/edit/delete cases with real-time point calculation
- Barcode scanner for case number input
- CSV import/export
- Analytics with multi-month trends
- Point settings management across 4 historical periods
