Set-Location "$PSScriptRoot\.."
Push-Location frontend; npm install; Pop-Location
Push-Location backend; python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt; Pop-Location
Write-Host "Setup done. Run ./scripts/dev.ps1"
