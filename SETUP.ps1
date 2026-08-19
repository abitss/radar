$ErrorActionPreference = "Stop"
Write-Host "`nRADAR Ultimate setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js 22 or newer, then run this script again."
}
$nodeVersion = (node -p "process.versions.node")
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 22) { throw "RADAR requires Node.js 22+. Found $nodeVersion" }
Write-Host "Node $nodeVersion OK" -ForegroundColor Green

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is missing." }
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Created .env.local from .env.example" -ForegroundColor Yellow
}

Write-Host "Running static checks..." -ForegroundColor Cyan
npm run check
npm run smoke

Write-Host "`nSetup files are ready." -ForegroundColor Green
Write-Host "Now edit .env.local and add DATABASE_URL plus your chosen AI credentials."
Write-Host "Then run: npm run dev"
Write-Host "Open: http://localhost:3000`n"
